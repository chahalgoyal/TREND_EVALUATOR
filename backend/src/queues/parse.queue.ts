import { Queue } from 'bullmq';
import redis from '../config/redis';
import { ParseJobDTO } from './dto';

export const parseQueue = new Queue<ParseJobDTO>('parseQueue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export default parseQueue;
