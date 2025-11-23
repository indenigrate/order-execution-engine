import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { orderQueue } from '../config/queue';
import { prisma } from '../config/database';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export async function orderRoutes(fastify: FastifyInstance) {

  fastify.get('/connect', { websocket: true }, async (connection: WebSocket, req: FastifyRequest) => {
    const socket = connection;
    let orderId: string | null = null;
    let redisSub: Redis | null = null;

    console.log('🔌 Client connected. Waiting for payload...');

    socket.on('message', async (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());

        if (payload.action === 'execute_order') {
          const { tokenIn, tokenOut, amountIn } = payload;
          if (!tokenIn || !tokenOut || !amountIn) return;

          orderId = randomUUID();
          
          // 1. Create DB Entry
          await prisma.order.create({
            data: { orderId, tokenIn, tokenOut, amountIn, status: 'PENDING' }
          });

          // 2. SETUP SUBSCRIPTION FIRST (Fixes "Routing" race condition)
          redisSub = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
          });

          redisSub.subscribe(`order-updates:${orderId}`);
          redisSub.on('message', (channel, message) => {
            socket.send(message);
            const data = JSON.parse(message);
            if (data.status === 'confirmed' || data.status === 'failed') {
              setTimeout(() => { redisSub?.disconnect(); socket.close(); }, 1000);
            }
          });

          // 3. SEND "PENDING" STATUS (Fixes "Pending" requirement)
          socket.send(JSON.stringify({ 
            status: 'pending', // <--- Changed from 'order_created'
            orderId, 
            message: 'Order received and queued' 
          }));

          // 4. ADD TO QUEUE LAST
          await orderQueue.add('execute-order', { orderId, tokenIn, tokenOut, amountIn });
          console.log(`✅ Order ${orderId} queued`);
        }
      } catch (error) {
        console.error('Socket error:', error);
      }
    });

    socket.on('close', () => {
      if (redisSub) redisSub.disconnect();
    });
  });
}