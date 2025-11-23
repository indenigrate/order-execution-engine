import { Queue, Worker } from 'bullmq';
import { redis } from './redis';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const ORDER_QUEUE_NAME = 'order-execution-queue';

// 1. The Queue (Producer adds jobs here)
export const orderQueue = new Queue(ORDER_QUEUE_NAME, { connection });

// 2. Default Job Options (Retry Logic)
export const defaultJobOptions = {
  attempts: 3,             // Retry up to 3 times
  backoff: {
    type: 'exponential',   // Wait longer between each retry (1s, 2s, 4s...)
    delay: 1000,
  },
  removeOnComplete: true,  // Auto-remove successful jobs to save Redis space
  removeOnFail: false,     // Keep failed jobs for inspection
};