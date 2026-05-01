import { Request, Response } from 'express';
import { checkDbConnection } from '../../config/database';
import { checkRedisConnection } from '../../config/redis';
import { scrapeQueue } from '../../queues/scrape.queue';
import { successResponse } from '../../shared/response-builder';

export async function livenessProbe(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function readinessProbe(_req: Request, res: Response): Promise<void> {
  const [dbOk, redisOk] = await Promise.all([
    checkDbConnection(),
    checkRedisConnection(),
  ]);

  let queueOk = false;
  try {
    const counts = await scrapeQueue.getJobCounts();
    queueOk = counts !== undefined;
  } catch {
    queueOk = false;
  }

  const healthy = dbOk && redisOk && queueOk;

  res.status(healthy ? 200 : 503).json(
    successResponse({
      status: healthy ? 'healthy' : 'degraded',
      services: {
        database: dbOk ? 'connected' : 'unreachable',
        redis: redisOk ? 'connected' : 'unreachable',
        queues: queueOk ? 'running' : 'unreachable',
      },
      timestamp: new Date().toISOString(),
    })
  );
}
