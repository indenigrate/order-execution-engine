import { Worker, Job } from 'bullmq';
import { prisma } from '../config/database';
import { dexService } from '../services/dex.service';
import { ORDER_QUEUE_NAME } from '../config/queue';
import { redis } from '../config/redis';

// Helper to simulate a small processing delay so users can see the updates
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const publishEvent = async (orderId: string, status: string, data?: any) => {
  const payload = JSON.stringify({ status, ...data });
  await redis.publish(`order-updates:${orderId}`, payload);
};

export const orderWorker = new Worker(ORDER_QUEUE_NAME, async (job: Job) => {
    const { orderId, tokenIn, tokenOut, amountIn } = job.data;
    console.log(`⚙️ Processing Order #${orderId}`);

    try {
      // --- STEP 1: ROUTING ---
      await prisma.order.update({ where: { orderId }, data: { status: 'ROUTING' } });
      await publishEvent(orderId, 'routing', { message: 'Comparing DEX prices...' });
      
      await sleep(500); // Visual delay
      const bestQuote = await dexService.getBestQuote(tokenIn, tokenOut, amountIn);
      
      // --- STEP 2: BUILDING ---
      await prisma.order.update({ where: { orderId }, data: { status: 'BUILDING', selectedDex: bestQuote.dex } });
      await publishEvent(orderId, 'building', { dex: bestQuote.dex, price: bestQuote.price });
      
      await sleep(500); // Visual delay

      // --- STEP 3: SUBMITTED (New!) ---
      // Requirement: "Transaction sent to network"
      await prisma.order.update({ where: { orderId }, data: { status: 'SUBMITTED' } });
      await publishEvent(orderId, 'submitted', { message: 'Transaction sent to Solana network', txHash: 'pending...' });
      
      await sleep(1000); // Simulate network propagation time

      // --- STEP 4: EXECUTION / CONFIRMED ---
      const result = await dexService.executeSwap(bestQuote.dex, tokenIn, tokenOut, amountIn);

      await prisma.order.update({
        where: { orderId },
        data: { status: 'CONFIRMED', txHash: result.txHash, executionPrice: result.executedPrice }
      });
      await publishEvent(orderId, 'confirmed', { txHash: result.txHash, price: result.executedPrice });

      return result;

    } catch (error: any) {
      await prisma.order.update({ where: { orderId }, data: { status: 'FAILED', failureReason: error.message } });
      await publishEvent(orderId, 'failed', { reason: error.message });
      throw error;
    }
  },
  { 
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || '6379') },
    concurrency: 10 
  }
);