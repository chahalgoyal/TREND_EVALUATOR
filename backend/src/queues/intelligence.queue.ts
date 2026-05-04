import { Queue } from 'bullmq';
import redis from '../config/redis';

// Export intelligence queue
export const intelligenceQueue = new Queue('intelligenceQueue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 24 * 3600, count: 500 }, // Keep 24 hours or 500 jobs
    removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
  },
});
