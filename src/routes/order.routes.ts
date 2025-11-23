import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws'; // <--- FIX 1: Import WebSocket from 'ws'
import { orderQueue } from '../config/queue';
import { prisma } from '../config/database';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export async function orderRoutes(fastify: FastifyInstance) {
  
  // 1. POST /api/orders/execute
  fastify.post('/execute', async (request, reply) => {
    // ... (This part remains the same)
    const { tokenIn, tokenOut, amountIn } = request.body as any;
    if (!tokenIn || !tokenOut || !amountIn) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }
    const orderId = randomUUID();
    await prisma.order.create({
      data: { orderId, tokenIn, tokenOut, amountIn, status: 'PENDING' }
    });
    await orderQueue.add('execute-order', { orderId, tokenIn, tokenOut, amountIn });
    return { orderId, status: 'pending', message: 'Order queued' };
  });

  // 2. WEBSOCKET /api/orders/updates
  fastify.get('/updates', { websocket: true }, async (connection: WebSocket, req: FastifyRequest) => { 
    // FIX 2: Type 'connection' as 'WebSocket' directly
    
    // In strict mode or new versions, 'connection' IS the socket.
    // We don't need 'connection.socket'. We use 'connection' directly.
    const socket = connection; 
    
    const query = req.query as { orderId?: string };
    const orderId = query.orderId;

    if (!orderId) {
      socket.send(JSON.stringify({ error: 'orderId required' }));
      socket.close();
      return;
    }

    console.log(`Client connected for order: ${orderId}`);

    // 1. IMMEDIATE UPDATE
    const currentOrder = await prisma.order.findUnique({
      where: { orderId }
    });

    if (currentOrder) {
      socket.send(JSON.stringify({
        status: 'CURRENT_STATE',
        dbStatus: currentOrder.status,
        payload: currentOrder 
      }));

      if (currentOrder.status === 'CONFIRMED' || currentOrder.status === 'FAILED') {
        socket.close();
        return;
      }
    }

    // 2. SUBSCRIBE
    const redisSub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    redisSub.subscribe(`order-updates:${orderId}`, (err) => {
      if (err) console.error('Failed to subscribe:', err);
    });

    redisSub.on('message', (channel, message) => {
      socket.send(message);
      
      const data = JSON.parse(message);
      if (data.status === 'confirmed' || data.status === 'failed') {
        setTimeout(() => {
            redisSub.disconnect();
            socket.close();
        }, 1000);
      }
    });

    socket.on('close', () => {
      console.log(`Client disconnected: ${orderId}`);
      redisSub.disconnect();
    });
  });
}