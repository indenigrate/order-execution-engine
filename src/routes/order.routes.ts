import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { orderQueue } from '../config/queue';
import { prisma } from '../config/database';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export async function orderRoutes(fastify: FastifyInstance) {

  // SINGLE ENDPOINT: Handles submission AND updates
  fastify.get('/connect', { websocket: true }, async (connection: WebSocket, req: FastifyRequest) => {
    const socket = connection;
    let orderId: string | null = null;
    let redisSub: Redis | null = null;

    console.log('🔌 Client connected. Waiting for order payload...');

    // 1. Listen for the initial "Order Submission" message from the client
    socket.on('message', async (rawMessage) => {
      try {
        // Parse the incoming message
        const payload = JSON.parse(rawMessage.toString());

        // Check if this is an order submission
        if (payload.action === 'execute_order') {
          const { tokenIn, tokenOut, amountIn } = payload;

          // Validate input
          if (!tokenIn || !tokenOut || !amountIn) {
            socket.send(JSON.stringify({ status: 'error', message: 'Missing fields: tokenIn, tokenOut, amountIn' }));
            return;
          }

          // Generate ID and Save to DB
          orderId = randomUUID();
          await prisma.order.create({
            data: { orderId, tokenIn, tokenOut, amountIn, status: 'PENDING' }
          });

          // Send confirmation back to client immediately
          socket.send(JSON.stringify({ 
            status: 'order_created', 
            orderId: orderId, 
            message: 'Order received and queued' 
          }));

          // Queue the job
          await orderQueue.add('execute-order', { orderId, tokenIn, tokenOut, amountIn });
          console.log(`✅ Order ${orderId} submitted via WebSocket`);

          // 2. NOW, Subscribe to Redis for updates on this same connection
          redisSub = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
          });

          redisSub.subscribe(`order-updates:${orderId}`, (err) => {
            if (err) console.error('Failed to subscribe:', err);
          });

          redisSub.on('message', (channel, message) => {
            socket.send(message); // Forward update to client

            const data = JSON.parse(message);
            if (data.status === 'confirmed' || data.status === 'failed') {
              // Graceful disconnect after completion
              setTimeout(() => {
                redisSub?.disconnect();
                socket.close();
              }, 1000);
            }
          });
        }
      } catch (error) {
        console.error('Socket error:', error);
        socket.send(JSON.stringify({ status: 'error', message: 'Invalid JSON format' }));
      }
    });

    // Cleanup on disconnect
    socket.on('close', () => {
      if (orderId) console.log(`🔌 Client disconnected: ${orderId}`);
      if (redisSub) redisSub.disconnect();
    });
  });
}