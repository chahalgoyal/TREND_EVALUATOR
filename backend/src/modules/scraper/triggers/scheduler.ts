import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../config/database';
import { scrapeQueue } from '../../../queues/scrape.queue';
import { ScrapeJobDTO } from '../../../queues/dto';
import { logger } from '../../../shared/logger';

/**
 * Scheduler — fires scrapeQueue jobs per platform interval.
 * SRS §2.2: Scheduler (node-cron) fires every N minutes per platform.
 */
export function startScheduler(): void {
  logger.info('Starting scraper scheduler');

  // Run every minute, check which platforms are due
  cron.schedule('* * * * *', async () => {
    try {
      const platforms = await db.query(
        `SELECT * FROM platforms WHERE is_active = true AND scrape_interval_min IS NOT NULL`
      );

      for (const platform of platforms.rows) {
        // Check if a scheduled job was recently created
        const recentJob = await db.query(
          `SELECT 1 FROM scrape_jobs
           WHERE platform_id = $1 AND trigger_type = 'scheduler'
           AND created_at > NOW() - ($2 || ' minutes')::INTERVAL
           LIMIT 1`,
          [platform.id, platform.scrape_interval_min]
        );

        if (recentJob.rowCount && recentJob.rowCount > 0) {
          continue; // Already scheduled recently
        }

        // Create scrape job
        const scrapeJobDbId = uuidv4();
        const jobId = uuidv4();

        await db.query(
          `INSERT INTO scrape_jobs (id, platform_id, trigger_type, target_type, status)
           VALUES ($1, $2, 'scheduler', 'feed', 'queued')`,
          [scrapeJobDbId, platform.id]
        );

        const jobDto: ScrapeJobDTO = {
          jobId,
          jobType: 'SCRAPE_FEED',
          platform: platform.slug,
          schemaVersion: 'v1',
          metadata: { trigger: 'scheduler', attempt: 1, initiatedBy: 'system' },
          createdAt: new Date().toISOString(),
          targetType: 'feed',
          scrapeJobDbId,
        };

        await scrapeQueue.add(jobDto.jobType, jobDto, { jobId });
        logger.info({ platform: platform.slug, jobId }, 'Scheduler: enqueued feed scrape');
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler tick error');
    }
  });

  logger.info('Scraper scheduler running (checks every minute)');
}
