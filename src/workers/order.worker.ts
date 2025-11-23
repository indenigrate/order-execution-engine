import { Worker, Job } from 'bullmq';
import { prisma } from '../config/database';
import { dexService } from '../services/dex.service';
import { ORDER_QUEUE_NAME } from '../config/queue';
import { redis } from '../config/redis'; // Redis for Publishing

interface OrderJobData {
  orderId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
}

// Helper to publish updates to Redis channel
// Channel name format: "order-updates:{orderId}"
const publishEvent = async (orderId: string, status: string, data?: any) => {
  const payload = JSON.stringify({ status, ...data });
  await redis.publish(`order-updates:${orderId}`, payload);
};

export const orderWorker = new Worker<OrderJobData>(
  ORDER_QUEUE_NAME,
  async (job: Job<OrderJobData>) => {
    const { orderId, tokenIn, tokenOut, amountIn } = job.data;
    console.log(`⚙️ Processing Order #${orderId}`);

    try {
      // 1. STATUS: PROCESSING
      await prisma.order.update({ where: { orderId }, data: { status: 'ROUTING' } });
      await publishEvent(orderId, 'routing', { message: 'Fetching quotes...' }); // <--- NOTIFY

      // 2. ROUTING
      const bestQuote = await dexService.getBestQuote(tokenIn, tokenOut, amountIn);
      await prisma.order.update({
        where: { orderId },
        data: { selectedDex: bestQuote.dex, status: 'BUILDING' }
      });
      await publishEvent(orderId, 'building', { 
        dex: bestQuote.dex, 
        price: bestQuote.price 
      }); // <--- NOTIFY

      // 3. EXECUTION
      const result = await dexService.executeSwap(bestQuote.dex, tokenIn, tokenOut, amountIn);

      // 4. CONFIRMED
      await prisma.order.update({
        where: { orderId },
        data: { status: 'CONFIRMED', txHash: result.txHash, executionPrice: result.executedPrice }
      });
      await publishEvent(orderId, 'confirmed', { 
        txHash: result.txHash, 
        price: result.executedPrice 
      }); // <--- NOTIFY

      return result;

    } catch (error: any) {
      // 5. FAILED
      await prisma.order.update({
        where: { orderId },
        data: { status: 'FAILED', failureReason: error.message }
      });
      await publishEvent(orderId, 'failed', { reason: error.message }); // <--- NOTIFY
      throw error;
    }
  },
  { 
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 10 
  }
);