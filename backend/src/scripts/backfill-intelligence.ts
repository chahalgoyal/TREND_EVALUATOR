import { db } from '../config/database';
import { intelligenceQueue } from '../queues/intelligence.queue';
import { startIntelligenceWorker, stopIntelligenceWorker } from '../modules/intelligence/intelligence.worker';
import { v4 as uuidv4 } from 'uuid';
import { IntelligenceJobDTO } from '../queues/dto';
import { logger } from '../shared/logger';

async function backfill() {
  logger.info('Starting Intelligence Backfill for historical data...');
  
  // 1. Fetch all existing posts that passed the threshold but have no score yet
  const res = await db.query(`
    SELECT p.*, pl.slug as platform_slug 
    FROM posts p 
    JOIN platforms pl ON p.platform_id = pl.id
    LEFT JOIN post_scores ps ON p.id = ps.post_id
    WHERE p.threshold_passed = true 
      AND ps.post_id IS NULL
  `);
  
  const posts = res.rows;
  logger.info(`Found ${posts.length} historical posts to process...`);
  
  if (posts.length === 0) {
    logger.info('Nothing to backfill!');
    await db.end();
    process.exit(0);
  }

  // Start the worker just for this script
  startIntelligenceWorker();

  // 2. Enqueue each post
  for (const post of posts) {
    // Fetch hashtags for this post
    const hRes = await db.query(`
      SELECT h.tag 
      FROM hashtags h
      JOIN post_hashtags ph ON ph.hashtag_id = h.id
      WHERE ph.post_id = $1
    `, [post.id]);
    const hashtags = hRes.rows.map(r => r.tag);

    const intelJob: IntelligenceJobDTO = {
      jobId: uuidv4(),
      jobType: 'EVALUATE_TREND',
      platform: post.platform_slug,
      schemaVersion: 'v1',
      metadata: { trigger: 'manual', attempt: 1, initiatedBy: 'backfill_script' },
      createdAt: new Date().toISOString(),
      postDbId: post.id,
      platformPostId: post.post_id,
      likes: post.likes,
      comments: post.comments,
      views: post.views,
      postedAt: post.posted_at,
      hashtags
    };
    
    await intelligenceQueue.add(intelJob.jobType, intelJob, { jobId: intelJob.jobId });
  }

  logger.info(`Enqueued ${posts.length} jobs. Waiting for processing...`);

  // Simple wait loop to ensure jobs finish
  while ((await intelligenceQueue.getWaitingCount()) > 0 || (await intelligenceQueue.getActiveCount()) > 0) {
    await new Promise(r => setTimeout(r, 1000));
  }

  logger.info('Backfill complete!');
  await stopIntelligenceWorker();
  await db.end();
  process.exit(0);
}

backfill().catch(console.error);
