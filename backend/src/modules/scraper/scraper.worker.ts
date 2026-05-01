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
import { PlatformConnector, RawPostFragment } from './connectors/interface';

// ── Platform connector registry ──────────────────────────────────────────────
const connectors: Record<string, PlatformConnector> = {
  instagram: new InstagramConnector(),
  linkedin: new LinkedInConnector(),
};

/**
 * Scraper Worker — processes scrapeQueue jobs.
 * 
 * Flow per job (SRS §2.2):
 * 1. Borrow browser from pool
 * 2. Create isolated context with saved session
 * 3. Login if needed
 * 4. Scrape posts (feed/keyword/profile)
 * 5. Store each post in raw_payloads
 * 6. Push one parseQueue job per post
 * 7. Update scrape_jobs audit log
 * 8. Return browser to pool
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

  // Acquire browser
  const browser = await browserPool.acquire();
  let postsScraped = 0;

  try {
    // Try to load saved browser state (from save-session.ts manual login)
    const { existsSync, readFileSync } = await import('fs');
    const statePath = `session-store/${data.platform}_state.json`;
    let context;

    if (existsSync(statePath)) {
      try {
        const stateData = JSON.parse(readFileSync(statePath, 'utf-8'));
        context = await browser.newContext({
          storageState: stateData,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 720 },
          locale: 'en-US',
        });
        jobLogger.info('Loaded saved browser state from save-session.ts');
      } catch (err) {
        jobLogger.warn({ err }, 'Failed to load saved state, falling back to cookies');
        const savedCookies = sessionManager.loadCookies(data.platform);
        context = await browserPool.createContext(browser, savedCookies ?? undefined);
      }
    } else {
      // Fallback: session manager cookies
      const savedCookies = sessionManager.loadCookies(data.platform);
      context = await browserPool.createContext(browser, savedCookies ?? undefined);
    }

    try {
      // Login
      const loggedIn = await connector.login(context);
      if (!loggedIn) {
        // Invalidate session and fail
        sessionManager.invalidate(data.platform);
        throw new Error(`Login failed for ${data.platform}`);
      }

      // Save successful session
      await sessionManager.saveCookies(data.platform, context);

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
      }

      // Store each fragment and enqueue to parseQueue
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
          };

          await parseQueue.add(parseJob.jobType, parseJob, { jobId: parseJob.jobId });
          postsScraped++;
        } catch (err) {
          jobLogger.error({ err, postId: fragment.postId }, 'Failed to store/enqueue fragment');
        }
      }

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

    throw err; // Let BullMQ handle retry
  } finally {
    browserPool.release(browser);
  }
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

  scrapeWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, 'scrapeQueue: Job failed');
  });

  logger.info({ concurrency: env.workers.scrapeWorkerConcurrency }, 'Scrape worker started');
  return scrapeWorker;
}

export { scrapeWorker };
