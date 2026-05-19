import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../config/database';
import { scrapeQueue } from '../../../queues/scrape.queue';
import { ScrapeJobDTO } from '../../../queues/dto';
import { logger } from '../../../shared/logger';
import { env } from '../../../config/env';
import { notifyCritical } from '../../../services/notification.service';

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
        `SELECT p.*, COUNT(pa.id) as num_accounts 
         FROM platforms p
         LEFT JOIN platform_accounts pa ON p.id = pa.platform_id AND pa.is_active = true
         WHERE p.is_active = true AND p.scrape_interval_min IS NOT NULL
         GROUP BY p.id`
      );

      for (const platform of platforms.rows) {
        let quantum = platform.scrape_interval_min;
        const numAccounts = parseInt(platform.num_accounts, 10);

        // Per-Account Scaling Strategy:
        const goalPerAccount = platform.scrape_interval_min || 16;
        let calculatedQuantum = goalPerAccount / (numAccounts || 1);

        // Platform-Specific Safety Floor (Protects the Server IP):
        // Instagram needs at least 12 mins between any two scrapes on one IP.
        // YouTube API is safe to run as fast as 1 min between scrapes.
        const safetyFloor = platform.slug === 'instagram' ? 12 : 1;

        quantum = Math.max(calculatedQuantum, safetyFloor);

        // Check if a scheduled job was recently created using the dynamic quantum
        const recentJob = await db.query(
          `SELECT 1 FROM scrape_jobs
           WHERE platform_id = $1 AND trigger_type = 'scheduler'
           AND created_at > NOW() - ($2 || ' minutes')::INTERVAL
           LIMIT 1`,
          [platform.id, quantum]
        );

        if (recentJob.rowCount && recentJob.rowCount > 0) {
          continue; // Already scheduled recently
        }

        // Create scrape job
        const scrapeJobDbId = uuidv4();
        const jobId = uuidv4();

        try {
          await db.query(
            `INSERT INTO scrape_jobs (id, platform_id, trigger_type, target_type, status)
             VALUES ($1, $2, 'scheduler', 'feed', 'queued')`,
            [scrapeJobDbId, platform.id]
          );
        } catch (err: any) {
          if (err.code === '23505') { // Unique violation
            logger.debug({ platform: platform.slug }, 'Scheduler: job already queued, skipping');
            continue;
          }
          throw err;
        }

        // ── Round-Robin: Pick the least-recently-used active account ──────
        let accountId: string | undefined;
        let sessionData: object | undefined;

        const accountRes = await db.query(
          `SELECT id, username, session_data
           FROM platform_accounts
           WHERE platform_id = $1 AND is_active = true
           AND (retry_after IS NULL OR retry_after < NOW())
           ORDER BY last_used_at ASC NULLS FIRST, RANDOM()
           LIMIT 1`,
          [platform.id]
        );

        if (accountRes.rows.length > 0) {
          const account = accountRes.rows[0];
          accountId = account.id;
          sessionData = account.session_data;

          // Stamp this account so next tick picks a different one
          await db.query(
            `UPDATE platform_accounts SET last_used_at = NOW() WHERE id = $1`,
            [accountId]
          );

          logger.info(
            { platform: platform.slug, account: account.username, quantum },
            'Scheduler: selected account (round-robin LRU)'
          );
        } else if (platform.slug !== 'youtube') {
          // Critical: no accounts available for browser-based platform
          logger.error(
            { platform: platform.slug },
            'CRITICAL: No active accounts found in database for platform.'
          );
          await notifyCritical(
            'No Active Accounts',
            `Platform: ${platform.slug}\nAll accounts are inactive or rate-limited. Scraping will fail until an account is re-enabled.`
          );
        } else {
          logger.debug(
            { platform: platform.slug, quantum },
            'Scheduler: no DB accounts, using filesystem session fallback'
          );
        }

        // Calculate Jitter (Random delay to prevent IP flagging)
        // Max jitter is 10% of the quantum or 5 minutes, whichever is smaller.
        const maxJitterMin = Math.min(quantum * 0.1, 5);
        const jitterMs = Math.floor(Math.random() * maxJitterMin * 60 * 1000);

        const jobDto: ScrapeJobDTO = {
          jobId,
          jobType: 'SCRAPE_FEED',
          platform: platform.slug,
          schemaVersion: 'v1',
          metadata: { trigger: 'scheduler', attempt: 1, initiatedBy: 'system', jitterMs },
          createdAt: new Date().toISOString(),
          targetType: 'feed',
          scrapeJobDbId,
          accountId,
          sessionData,
        };

        await scrapeQueue.add(jobDto.jobType, jobDto, {
          jobId,
          delay: jitterMs // <--- This is the Jitter implementation
        });

        logger.info({
          platform: platform.slug,
          jobId,
          quantum,
          jitterSec: Math.floor(jitterMs / 1000)
        }, 'Scheduler: enqueued feed scrape with jitter');
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler tick error');
    }
  });

  logger.info('Scraper scheduler running (checks every minute)');

  // ── Cleanup Task: Daily Maintenance (Runs daily at midnight) ─────
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Starting database maintenance and retention task...');

      // 1. Delete old raw payloads (configurable TTL)
      const payloadTtl = env.scraper.rawPayloadTtlHours;
      const payloadRes = await db.query(
        `DELETE FROM raw_payloads WHERE created_at < NOW() - ($1 || ' hours')::INTERVAL`,
        [payloadTtl]
      );

      // 2. Data Retention Policy: Delete posts older than 7 days
      // This automatically cleans up post_scores and post_hashtags via CASCADE
      const retentionDays = 7;
      const postRes = await db.query(
        `DELETE FROM posts WHERE scraped_at < NOW() - ($1 || ' days')::INTERVAL`,
        [retentionDays]
      );

      logger.info(
        {
          payloadsDeleted: payloadRes.rowCount,
          postsDeleted: postRes.rowCount,
          retention: '7 days'
        },
        'Database maintenance task finished'
      );
    } catch (err) {
      logger.error({ err }, 'Database maintenance task failed');
    }
  });
}
