import { FastifyInstance } from 'fastify';
import { orderQueue } from '../config/queue';
import { prisma } from '../config/database';
import { randomUUID } from 'crypto';
import Redis from 'ioredis'; // Need a new connection for subscribing

export async function orderRoutes(fastify: FastifyInstance) {
  
  // 1. POST /api/orders/execute
  fastify.post('/execute', async (request, reply) => {
    const { tokenIn, tokenOut, amountIn } = request.body as any;

    if (!tokenIn || !tokenOut || !amountIn) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    const orderId = randomUUID();

    // Save initial state to DB
    await prisma.order.create({
      data: {
        orderId,
        tokenIn,
        tokenOut,
        amountIn,
        status: 'PENDING'
      }
    });

    // Add to Queue
    await orderQueue.add('execute-order', {
      orderId,
      tokenIn,
      tokenOut,
      amountIn
    });

    return { orderId, status: 'pending', message: 'Order queued' };
  });

  // 2. WEBSOCKET /api/orders/updates?orderId=...
  fastify.get('/updates', { websocket: true }, (connection, req) => {
    const query = req.query as { orderId?: string };
    const orderId = query.orderId;

    if (!orderId) {
      connection.socket.send(JSON.stringify({ error: 'orderId required' }));
      connection.socket.close();
      return;
    }

    console.log(`🔌 Client connected for order: ${orderId}`);

    // Create a dedicated Redis subscriber for this connection
    // (Redis mandates a dedicated connection when in "Subscriber Mode")
    const redisSub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    // Subscribe to the specific channel for this order
    redisSub.subscribe(`order-updates:${orderId}`, (err) => {
      if (err) console.error('Failed to subscribe:', err);
    });

    // Forward Redis messages to WebSocket
    redisSub.on('message', (channel, message) => {
      connection.socket.send(message);
      
      // If order is done, we can optionally close connection
      const data = JSON.parse(message);
      if (data.status === 'confirmed' || data.status === 'failed') {
        // Clean up Redis connection after short delay
        setTimeout(() => redisSub.disconnect(), 1000);
      }
    });

    // Cleanup on disconnect
    connection.socket.on('close', () => {
      console.log(`🔌 Client disconnected: ${orderId}`);
      redisSub.disconnect();
    });
  });
}