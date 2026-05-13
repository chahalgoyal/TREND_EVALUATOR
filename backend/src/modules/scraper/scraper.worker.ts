import { Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import redis from '../../config/redis';
import { db } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { ScrapeJobDTO, ParseJobDTO } from '../../queues/dto';
import { parseQueue } from '../../queues/parse.queue';
import { browserPool } from './browser-pool/pool';
import { sessionManager } from './session-manager/session';
import { rawStorageRepository } from './raw-storage/rawStorage.repository';
import { InstagramConnector } from './connectors/instagram/connector';
import { LinkedInConnector } from './connectors/linkedin/connector';
import { YouTubeConnector } from './connectors/youtube/connector';
import { PlatformConnector, RawPostFragment } from './connectors/interface';
import { notifyCritical, notifyError, notifyHealth } from '../../services/notification.service';

// ── Platform connector registry ──────────────────────────────────────────────
const connectors: Record<string, PlatformConnector> = {
  instagram: new InstagramConnector(),
  linkedin: new LinkedInConnector(),
  youtube: new YouTubeConnector(),
};

/**
 * Scraper Worker — processes scrapeQueue jobs.
 * 
 * Flow per job (SRS §2.2):
 * 1. Check if connector requires a browser (API-based connectors skip this)
 * 2. Borrow browser from pool (if needed)
 * 3. Create isolated context with saved session
 * 4. Login if needed
 * 5. Scrape posts (feed/keyword/profile)
 * 6. Store each post in raw_payloads
 * 7. Push one parseQueue job per post
 * 8. Update scrape_jobs audit log
 * 9. Return browser to pool
 */
async function processScrapeJob(job: Job<ScrapeJobDTO>): Promise<void> {
  const data = job.data;
  const jobLogger = logger.child({ jobId: data.jobId, platform: data.platform, jobType: data.jobType });

  jobLogger.info('Scrape job started');

  // Update audit log
  await db.query(
    `UPDATE scrape_jobs SET status = 'running', started_at = NOW() WHERE id = $1`,
    [data.scrapeJobDbId]
  );

  const connector = connectors[data.platform];
  if (!connector) {
    throw new Error(`No connector for platform: ${data.platform}`);
  }

  // Look up platform_id
  const platformResult = await db.query(
    `SELECT id FROM platforms WHERE slug = $1`,
    [data.platform]
  );
  const platformId = platformResult.rows[0]?.id;
  if (!platformId) throw new Error(`Platform not found in DB: ${data.platform}`);

  let postsScraped = 0;

  // ── API-based connectors (e.g. YouTube) — no browser needed ────────────
  if (connector.requiresBrowser === false) {
    try {
      jobLogger.info('API-based connector — skipping browser acquisition');

      let fragments: RawPostFragment[] = [];
      // Pass sessionData (which may contain API keys) as the "context"
      const apiContext = data.sessionData as any;

      switch (data.targetType) {
        case 'feed':
          fragments = await connector.scrapeFeed(apiContext);
          break;
        case 'keyword':
          fragments = await connector.scrapeKeyword(apiContext, data.targetValue!);
          break;
        case 'profile':
          fragments = await connector.scrapeProfile(apiContext, data.targetValue!);
          break;
      }

      jobLogger.info({ fragmentCount: fragments.length }, 'API scraping complete, storing raw payloads');

      postsScraped = await storeAndEnqueueFragments(fragments, platformId, data, jobLogger);

      // Update audit log — success
      await db.query(
        `UPDATE scrape_jobs SET status = 'completed', posts_scraped = $2, completed_at = NOW() WHERE id = $1`,
        [data.scrapeJobDbId, postsScraped]
      );

      jobLogger.info({ postsScraped }, 'Scrape job completed');
      return;
    } catch (err: any) {
      jobLogger.error({ err: err.message }, 'Scrape job failed');
      await db.query(
        `UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW(), posts_scraped = $3 WHERE id = $1`,
        [data.scrapeJobDbId, err.message, postsScraped]
      );
      throw err;
    }
  }

  // ── Browser-based connectors (Instagram, LinkedIn) ─────────────────────
  const browser = await browserPool.acquire();

  try {
    let context;

    // ── Priority 1: Use DB-sourced session from round-robin scheduler ───
    if (data.sessionData) {
      try {
        context = await browser.newContext({
          storageState: data.sessionData as any,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 720 },
          locale: 'en-US',
        });
        jobLogger.info({ accountId: data.accountId }, 'Using DB session (round-robin account)');
      } catch (err) {
        jobLogger.warn({ err }, 'Failed to load DB session data, falling back to filesystem');
        context = undefined; // Will trigger filesystem fallback below
      }
    }

    // ── Priority 2: Filesystem session fallback ─────────────────────────
    if (!context) {
      const { existsSync, readFileSync } = await import('fs');
      const statePath = `session-store/${data.platform}_state.json`;

      if (existsSync(statePath)) {
        try {
          const stateData = JSON.parse(readFileSync(statePath, 'utf-8'));
          context = await browser.newContext({
            storageState: stateData,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'en-US',
          });
          jobLogger.info('Loaded saved browser state from filesystem');
        } catch (err) {
          jobLogger.warn({ err }, 'Failed to load saved state, falling back to cookies');
          const savedCookies = sessionManager.loadCookies(data.platform);
          context = await browserPool.createContext(browser, savedCookies ?? undefined);
        }
      } else {
        const savedCookies = sessionManager.loadCookies(data.platform);
        context = await browserPool.createContext(browser, savedCookies ?? undefined);
      }
    }

    try {
      // Login
      const loggedIn = await connector.login(context);
      if (!loggedIn) {
        // Invalidate session and fail
        sessionManager.invalidate(data.platform);
        // If using DB account, handle failure count
        if (data.accountId) {
          await db.query(`
            UPDATE platform_accounts 
            SET consecutive_failures = consecutive_failures + 1,
                last_failure_reason = $2,
                retry_after = NOW() + INTERVAL '1 hour',
                is_active = CASE WHEN consecutive_failures + 1 >= 3 THEN false ELSE is_active END,
                updated_at = NOW()
            WHERE id = $1
          `, [data.accountId, 'login_failed']);
          jobLogger.warn({ accountId: data.accountId }, 'DB account failed login, failure count updated');
        }
        throw new Error(`Login failed for ${data.platform}`);
      }

      // Save successful session to filesystem
      await sessionManager.saveCookies(data.platform, context);

      // Persist refreshed cookies back to DB if using a round-robin account
      if (data.accountId) {
        try {
          const storageState = await context.storageState();
          await db.query(`
            UPDATE platform_accounts 
            SET session_data = $1, 
                consecutive_failures = 0, 
                retry_after = NULL, 
                updated_at = NOW() 
            WHERE id = $2
          `, [JSON.stringify(storageState), data.accountId]);
          jobLogger.info({ accountId: data.accountId }, 'Refreshed session saved back to DB and failure count reset');
        } catch (err) {
          jobLogger.warn({ err }, 'Failed to persist refreshed session to DB');
        }
      }

      // Scrape based on target type
      let fragments: RawPostFragment[] = [];

      switch (data.targetType) {
        case 'feed':
          fragments = await connector.scrapeFeed(context);
          break;
        case 'keyword':
          fragments = await connector.scrapeKeyword(context, data.targetValue!);
          break;
        case 'profile':
          fragments = await connector.scrapeProfile(context, data.targetValue!);
          break;
      }

      jobLogger.info({ fragmentCount: fragments.length }, 'Scraping complete, storing raw payloads');

      if (fragments.length === 0) {
        jobLogger.error('🚨 WARNING: Selectors or API interception might be broken - 0 posts extracted!');
        await notifyHealth(
          'Zero Posts Extracted', 
          `Scrape cycle completed but 0 posts were discovered. Session may be invalid or Explore page changed.`,
          [
            { name: 'Platform', value: data.platform, inline: true },
            { name: 'Account ID', value: data.accountId ?? 'anonymous/filesystem', inline: true },
            { name: 'Scrape Job DB ID', value: data.scrapeJobDbId, inline: false },
            { name: 'Queue Job ID', value: data.jobId, inline: false }
          ]
        );
      }

      postsScraped = await storeAndEnqueueFragments(fragments, platformId, data, jobLogger);

      // Update audit log — success
      await db.query(
        `UPDATE scrape_jobs SET status = 'completed', posts_scraped = $2, completed_at = NOW() WHERE id = $1`,
        [data.scrapeJobDbId, postsScraped]
      );

      jobLogger.info({ postsScraped }, 'Scrape job completed');
    } finally {
      await context.close();
    }
  } catch (err: any) {
    jobLogger.error({ err: err.message }, 'Scrape job failed');

    // Update audit log — failure
    await db.query(
      `UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW(), posts_scraped = $3 WHERE id = $1`,
      [data.scrapeJobDbId, err.message, postsScraped]
    );

    // Common fields for all error notifications
    const errorFields = [
      { name: 'Platform', value: data.platform, inline: true },
      { name: 'Account ID', value: data.accountId ?? 'anonymous/filesystem', inline: true },
      { name: 'Scrape Job DB ID', value: data.scrapeJobDbId, inline: false },
      { name: 'Queue Job ID', value: data.jobId, inline: false }
    ];

    // Notify: login failures are errors; browser pool exhaustion is critical
    if (err.message?.includes('Login failed')) {
      await notifyError('Scraper Login Failed', err.message, errorFields);
    } else if (err.message?.includes('browser') || err.message?.includes('pool')) {
      await notifyCritical('Browser Pool Error', err.message, errorFields);
    } else {
      await notifyError('Scrape Job Failed', err.message, errorFields);
    }

    throw err; // Let BullMQ handle retry
  } finally {
    browserPool.release(browser);
  }
}

/**
 * Store raw fragments and enqueue parse jobs.
 * Shared by both browser-based and API-based connector flows.
 */
async function storeAndEnqueueFragments(
  fragments: RawPostFragment[],
  platformId: number,
  data: ScrapeJobDTO,
  jobLogger: any,
): Promise<number> {
  let postsScraped = 0;

  for (const fragment of fragments) {
    try {
      // Store raw payload
      const rawPayloadId = await rawStorageRepository.store(fragment, platformId, data.jobId);

      // Determine payload type
      const payloadType = fragment.postJson ? 'api_json' : 'html';
      const jobType = payloadType === 'api_json' ? 'PARSE_POST_API' : 'PARSE_POST_HTML';

      // Build ParseJobDTO
      const parseJob: ParseJobDTO = {
        jobId: uuidv4(),
        jobType,
        platform: data.platform,
        schemaVersion: 'v1',
        metadata: {
          trigger: data.metadata.trigger,
          attempt: 1,
          initiatedBy: data.metadata.initiatedBy,
        },
        createdAt: new Date().toISOString(),
        rawPayloadId,
        payloadType: payloadType as 'html' | 'api_json' | 'graphql',
        sourceType: fragment.source,
        scrapeJobDbId: data.scrapeJobDbId,
      };

      await parseQueue.add(parseJob.jobType, parseJob, { jobId: parseJob.jobId });
      postsScraped++;
    } catch (err) {
      jobLogger.error({ err, postId: fragment.postId }, 'Failed to store/enqueue fragment');
    }
  }

  return postsScraped;
}

// ── Create and export the worker ─────────────────────────────────────────────
let scrapeWorker: Worker<ScrapeJobDTO> | null = null;

export function startScrapeWorker(): Worker<ScrapeJobDTO> {
  scrapeWorker = new Worker<ScrapeJobDTO>(
    'scrapeQueue',
    processScrapeJob,
    {
      connection: redis,
      concurrency: env.workers.scrapeWorkerConcurrency,
    }
  );

  scrapeWorker.on('completed', (job) => {
    logger.info({ jobId: job.data.jobId }, 'scrapeQueue: Job completed');
  });

  scrapeWorker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, 'scrapeQueue: Job failed');
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      await notifyCritical('Scrape Job FATAL', `Platform: ${job.data.platform}\nJob ID: ${job.id} failed after all retries.\nError: ${err.message}`);
    }
  });

  logger.info({ concurrency: env.workers.scrapeWorkerConcurrency }, 'Scrape worker started');
  return scrapeWorker;
}

export { scrapeWorker };
