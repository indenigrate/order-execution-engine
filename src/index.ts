import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { prisma } from './config/database'; 
import { redis } from './config/redis'; // <--- Ensure this is imported
import { orderWorker } from './workers/order.worker';
import { orderRoutes } from './routes/order.routes';

dotenv.config();

const server = Fastify({ logger: true });

server.register(websocket);

server.get('/ping', async (request, reply) => {
  return { status: 'ok', message: 'Order Execution Engine is running' };
});

const start = async () => {
  try {
    // 1. Connect Database
    await prisma.$connect();
    console.log('Database connected successfully via Postgres Adapter');
    // 2. Redis
    await redis.ping();
    // 3. Start Server
    console.log(`Order Worker started with concurrency: ${orderWorker.opts.concurrency}`);
    
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running at http://localhost:${PORT}`);
    
  } catch (err) {
    server.log.error(err);
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
};

start();