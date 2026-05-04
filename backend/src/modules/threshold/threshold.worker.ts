import { Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import { db } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { ThresholdJobDTO, NormalizedPostDTO, IntelligenceJobDTO } from '../../queues/dto';
import { intelligenceQueue } from '../../queues/intelligence.queue';
import { v4 as uuidv4 } from 'uuid';

/**
 * Threshold Worker — evaluates posts against engagement rules.
 * 
 * Flow (SRS §3.8):
 * 1. Load all active threshold_rules for the post's platform
 * 2. Evaluate each rule against post metrics
 * 3. ALL rules must pass for threshold_passed = true
 * 4. If PASS → upsert post + hashtags
 * 5. If FAIL → log discard, job completes without DB insert
 */
async function processThresholdJob(job: Job<ThresholdJobDTO>): Promise<void> {
  const data = job.data;
  const post = data.postDTO;
  const jobLogger = logger.child({ jobId: data.jobId, platform: post.platform, postId: post.platformPostId });

  jobLogger.info('Threshold evaluation started');

  // Load threshold rules for this platform
  const platformResult = await db.query(
    `SELECT id FROM platforms WHERE slug = $1`,
    [post.platform]
  );
  const platformId = platformResult.rows[0]?.id;
  if (!platformId) {
    jobLogger.error('Platform not found');
    return;
  }

  const rulesResult = await db.query(
    `SELECT * FROM threshold_rules WHERE platform_id = $1 AND is_active = true`,
    [platformId]
  );
  const rules = rulesResult.rows;

  // Evaluate all rules — ANY rule passing means the post passes threshold
  // If there are no rules configured, we default to false (or true, depending on business logic, but let's say false if rules are expected)
  let thresholdPassed = rules.length === 0;

  for (const rule of rules) {
    const metricValue = getMetricValue(post, rule.metric_name);
    const passes = evaluateRule(metricValue, rule.operator, Number(rule.threshold_value));

    if (passes) {
      thresholdPassed = true;
    } else {
      jobLogger.debug({
        metric: rule.metric_name,
        value: metricValue,
        operator: rule.operator,
        threshold: rule.threshold_value,
      }, 'Threshold rule FAILED');
    }
  }

  if (!thresholdPassed && rules.length > 0) {
    jobLogger.info({ likes: post.likes, comments: post.comments }, 'Post did NOT pass threshold — still storing');
  }

  // ── PERSIST: upsert post regardless (threshold_passed is a flag, not a gate) ──
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // UPSERT post (SRS §3.11 canonical pattern)
    const upsertResult = await client.query(
      `INSERT INTO posts (
        platform_id, post_id, author_id, author_username,
        caption, likes, comments, shares, views,
        source_type, raw_payload_id, posted_at, threshold_passed
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (post_id, platform_id)
      DO UPDATE SET
        author_id        = EXCLUDED.author_id,
        author_username  = EXCLUDED.author_username,
        caption          = EXCLUDED.caption,
        likes            = EXCLUDED.likes,
        comments         = EXCLUDED.comments,
        shares           = EXCLUDED.shares,
        views            = EXCLUDED.views,
        threshold_passed = EXCLUDED.threshold_passed,
        posted_at        = GREATEST(posts.posted_at, EXCLUDED.posted_at),
        scraped_at       = NOW()
      RETURNING id, (xmax = 0) AS is_new_insert`,
      [
        platformId,
        post.platformPostId,
        post.authorId ?? null,
        post.authorUsername ?? null,
        post.caption ?? null,
        post.likes,
        post.comments,
        post.shares,
        post.views,
        post.sourceType,
        post.rawPayloadId ?? null,
        post.postedAt ?? null,
        thresholdPassed,
      ]
    );

    const postRow = upsertResult.rows[0];
    const isNewInsert = postRow.is_new_insert;
    const postDbId = postRow.id;

    // UPSERT hashtags + post_hashtags (always, since post_hashtags uses ON CONFLICT DO NOTHING)
    if (post.hashtags.length > 0) {
      for (const tag of post.hashtags) {
        // Upsert hashtag
        const hashtagResult = await client.query(
          `INSERT INTO hashtags (tag, post_count, first_seen_at, last_seen_at)
           VALUES ($1, 1, NOW(), NOW())
           ON CONFLICT (tag)
           DO UPDATE SET
             post_count   = hashtags.post_count + 1,
             last_seen_at = NOW()
           RETURNING id`,
          [tag]
        );
        const hashtagId = hashtagResult.rows[0].id;

        // Insert post_hashtags
        await client.query(
          `INSERT INTO post_hashtags (post_id, hashtag_id, platform_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (post_id, hashtag_id) DO NOTHING`,
          [postDbId, hashtagId, platformId]
        );
      }
    }

    await client.query('COMMIT');

    jobLogger.info({
      isNew: isNewInsert,
      thresholdPassed,
      hashtags: post.hashtags.length,
      likes: post.likes,
    }, 'Post persisted');

    // ── Dispatch to Intelligence Layer ──
    if (thresholdPassed) {
      const intelJob: IntelligenceJobDTO = {
        jobId: uuidv4(),
        jobType: 'EVALUATE_TREND',
        platform: data.platform,
        schemaVersion: 'v1',
        metadata: data.metadata,
        createdAt: new Date().toISOString(),
        postDbId: postDbId,
        platformPostId: post.platformPostId,
        likes: post.likes,
        comments: post.comments,
        views: post.views,
        postedAt: post.postedAt,
        hashtags: post.hashtags
      };
      await intelligenceQueue.add(intelJob.jobType, intelJob, { jobId: intelJob.jobId });
      jobLogger.info('Dispatched to intelligenceQueue');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Helper functions ─────────────────────────────────────────────────────────
function getMetricValue(post: NormalizedPostDTO, metric: string): number {
  switch (metric) {
    case 'likes':    return post.likes;
    case 'comments': return post.comments;
    case 'shares':   return post.shares;
    case 'views':    return post.views;
    default: return 0;
  }
}

function evaluateRule(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'gte': return value >= threshold;
    case 'gt':  return value > threshold;
    case 'lte': return value <= threshold;
    case 'lt':  return value < threshold;
    default:    return false;
  }
}

// ── Worker setup ─────────────────────────────────────────────────────────────
let thresholdWorker: Worker<ThresholdJobDTO> | null = null;

export function startThresholdWorker(): Worker<ThresholdJobDTO> {
  thresholdWorker = new Worker<ThresholdJobDTO>(
    'thresholdQueue',
    processThresholdJob,
    {
      connection: redis,
      concurrency: env.workers.thresholdWorkerConcurrency,
    }
  );

  thresholdWorker.on('completed', (job) => {
    logger.info({ jobId: job.data.jobId }, 'thresholdQueue: Job completed');
  });

  thresholdWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, 'thresholdQueue: Job failed');
  });

  logger.info({ concurrency: env.workers.thresholdWorkerConcurrency }, 'Threshold worker started');
  return thresholdWorker;
}

export { thresholdWorker };
