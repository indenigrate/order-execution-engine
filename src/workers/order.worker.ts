import { Worker, Job } from 'bullmq';
import { prisma } from '../config/database';
import { dexService } from '../services/dex.service';
import { ORDER_QUEUE_NAME } from '../config/queue';

interface OrderJobData {
  orderId: string;   // The internal DB ID or public UUID
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const orderWorker = new Worker<OrderJobData>(
  ORDER_QUEUE_NAME,
  async (job: Job<OrderJobData>) => {
    const { orderId, tokenIn, tokenOut, amountIn } = job.data;
    
    console.log(`⚙️ Processing Order #${orderId} (Attempt ${job.attemptsMade + 1})`);

    try {
      // 1. Update Status: PROCESSING
      await prisma.order.update({
        where: { orderId },
        data: { status: 'ROUTING' } 
      });

      // 2. Routing: Find Best Price
      const bestQuote = await dexService.getBestQuote(tokenIn, tokenOut, amountIn);
      
      // Update DB with decision
      await prisma.order.update({
        where: { orderId },
        data: { 
          selectedDex: bestQuote.dex,
          status: 'BUILDING' 
        }
      });

      // 3. Execution: Run the Swap
      const result = await dexService.executeSwap(bestQuote.dex, tokenIn, tokenOut, amountIn);

      // 4. Success: Update DB
      await prisma.order.update({
        where: { orderId },
        data: { 
          status: 'CONFIRMED',
          txHash: result.txHash,
          executionPrice: result.executedPrice
        }
      });

      console.log(`✅ Order #${orderId} Completed!`);
      return result;

    } catch (error: any) {
      console.error(`❌ Order #${orderId} Failed: ${error.message}`);
      
      // Update DB to reflect failure (will be overwritten if retry succeeds)
      await prisma.order.update({
        where: { orderId },
        data: { 
          status: 'FAILED',
          failureReason: error.message 
        }
      });

      // Throwing error triggers BullMQ retry mechanism
      throw error;
    }
  },
  { 
    connection,
    concurrency: 10 // "Queue system managing up to 10 concurrent orders" [cite: 57]
  }
);

// Listen for worker events
orderWorker.on('completed', (job) => {
  console.log(`Job ${job.id} finished successfully`);
});

orderWorker.on('failed', (job, err) => {
  console.log(`Job ${job.id} failed with ${err.message}`);
});