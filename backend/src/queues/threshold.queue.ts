import { Queue } from 'bullmq';
import redis from '../config/redis';
import { ThresholdJobDTO } from './dto';

export const thresholdQueue = new Queue<ThresholdJobDTO>('thresholdQueue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export default thresholdQueue;
