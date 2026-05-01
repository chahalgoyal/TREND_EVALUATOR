import { Queue } from 'bullmq';
import redis from '../config/redis';

// trendQueue is registered but empty — reserved for v2 trend intelligence module
export const trendQueue = new Queue('trendQueue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

export default trendQueue;
