import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { scrapeQueue } from '../../queues/scrape.queue';
import { ScrapeJobDTO } from '../../queues/dto';
import { successResponse } from '../../shared/response-builder';
import { ValidationError, NotFoundError, QueueError } from '../../shared/exceptions';
import { v4 as uuidv4 } from 'uuid';

// POST /api/v1/scraper/run
export async function triggerScraper(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { platform, targetType, targetValue } = req.body as {
      platform: string; targetType: string; targetValue?: string;
    };

    if (!platform || !targetType) {
      return next(new ValidationError('platform and targetType are required'));
    }
    if (targetType !== 'feed' && !targetValue) {
      return next(new ValidationError('targetValue is required when targetType is keyword or profile'));
    }

    // Look up platform
    const platformResult = await db.query(
      `SELECT * FROM platforms WHERE slug = $1 AND is_active = true`,
      [platform]
    );
    if (!platformResult.rows[0]) {
      return next(new ValidationError(`Platform '${platform}' not found or inactive`));
    }

    const platformRow = platformResult.rows[0];
    const scrapeJobDbId = uuidv4();
    const jobId = uuidv4();

    // Create audit record
    await db.query(
      `INSERT INTO scrape_jobs (id, platform_id, trigger_type, target_type, target_value, status)
       VALUES ($1, $2, 'manual', $3, $4, 'queued')`,
      [scrapeJobDbId, platformRow.id, targetType, targetValue ?? null]
    );

    // Build DTO and enqueue
    const jobDto: ScrapeJobDTO = {
      jobId,
      jobType: targetType === 'feed' ? 'SCRAPE_FEED'
               : targetType === 'keyword' ? 'SCRAPE_KEYWORD'
               : 'SCRAPE_PROFILE',
      platform: platformRow.slug,
      schemaVersion: 'v1',
      metadata: { trigger: 'manual', attempt: 1, initiatedBy: 'admin' },
      createdAt: new Date().toISOString(),
      targetType: targetType as 'feed' | 'keyword' | 'profile',
      targetValue,
      scrapeJobDbId,
    };

    let bullJob;
    try {
      bullJob = await scrapeQueue.add(jobDto.jobType, jobDto, { jobId });
    } catch {
      await db.query(`UPDATE scrape_jobs SET status = 'failed', error_message = 'Queue unreachable' WHERE id = $1`, [scrapeJobDbId]);
      return next(new QueueError('scrapeQueue is unreachable'));
    }

    const waitingCount = await scrapeQueue.getWaitingCount();

    res.status(202).json(successResponse({
      jobId: bullJob.id,
      scrapeJobId: scrapeJobDbId,
      status: 'queued',
      estimatedQueuePosition: waitingCount,
    }));
  } catch (err) { next(err); }
}

// GET /api/v1/scraper/jobs
export async function getScrapeJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { platform, status, trigger_type, from, to, cursor, limit = '20' } = req.query as Record<string, string>;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (platform) {
      conditions.push(`pl.slug = $${idx++}`); params.push(platform);
    }
    if (status)        { conditions.push(`sj.status = $${idx++}`); params.push(status); }
    if (trigger_type)  { conditions.push(`sj.trigger_type = $${idx++}`); params.push(trigger_type); }
    if (from) { conditions.push(`sj.created_at >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`sj.created_at <= $${idx++}`); params.push(to); }
    if (cursor) { conditions.push(`sj.created_at < $${idx++}`); params.push(cursor); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT sj.*, pl.slug AS platform_slug
      FROM scrape_jobs sj
      JOIN platforms pl ON sj.platform_id = pl.id
      ${where}
      ORDER BY sj.created_at DESC
      LIMIT $${idx}
    `;
    params.push(limitNum + 1);

    const result = await db.query(sql, params);
    const rows = result.rows;
    const hasMore = rows.length > limitNum;
    const data = hasMore ? rows.slice(0, limitNum) : rows;
    const nextCursor = hasMore ? data[data.length - 1].created_at : undefined;

    res.json(successResponse(data, { limit: limitNum, count: data.length, nextCursor }));
  } catch (err) { next(err); }
}

// GET /api/v1/scraper/jobs/:jobId
export async function getScrapeJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT sj.*, pl.slug AS platform_slug FROM scrape_jobs sj JOIN platforms pl ON sj.platform_id = pl.id WHERE sj.id = $1`,
      [req.params.jobId]
    );
    if (!result.rows[0]) return next(new NotFoundError('Scrape job'));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}
