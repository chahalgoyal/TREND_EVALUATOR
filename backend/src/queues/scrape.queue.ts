import { Queue } from 'bullmq';
import redis from '../config/redis';
import { ScrapeJobDTO } from './dto';

export const scrapeQueue = new Queue<ScrapeJobDTO>('scrapeQueue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30s → 60s → 120s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export default scrapeQueue;
