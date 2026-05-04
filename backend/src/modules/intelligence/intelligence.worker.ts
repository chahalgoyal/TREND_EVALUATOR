import { Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import { db } from '../../config/database';
import { logger } from '../../shared/logger';
import { IntelligenceJobDTO } from '../../queues/dto';
import { 
  calculateEngagementRate, 
  calculateTimeDecayScore, 
  calculateFinalTrendScore,
  calculateVelocity
} from './algorithms';

async function processIntelligenceJob(job: Job<IntelligenceJobDTO>): Promise<void> {
  const data = job.data;
  const jobLogger = logger.child({ jobId: data.jobId, postId: data.postDbId });

  jobLogger.info('Intelligence job started');

  try {
    // 1. Calculate Post Scores
    const engagementRate = calculateEngagementRate(data.likes, data.comments, data.views || 0);
    const timeDecayScore = calculateTimeDecayScore(engagementRate, data.postedAt);
    const totalTrendScore = calculateFinalTrendScore(data.likes, timeDecayScore);

    // Save to post_scores
    await db.query(`
      INSERT INTO post_scores (post_id, engagement_rate, time_decay_score, total_trend_score, calculated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (post_id) DO UPDATE SET 
        engagement_rate = EXCLUDED.engagement_rate,
        time_decay_score = EXCLUDED.time_decay_score,
        total_trend_score = EXCLUDED.total_trend_score,
        calculated_at = NOW()
    `, [data.postDbId, engagementRate, timeDecayScore, totalTrendScore]);

    jobLogger.debug({ engagementRate, timeDecayScore, totalTrendScore }, 'Post scores saved');

    // 2. Process Hashtags
    for (const tag of data.hashtags) {
      // Find hashtag ID
      const hashtagRes = await db.query(`SELECT id FROM hashtags WHERE tag = $1`, [tag]);
      if (!hashtagRes.rows[0]) continue;
      const hashtagId = hashtagRes.rows[0].id;

      // Upsert today's bucket
      await db.query(`
        INSERT INTO hashtag_analytics (hashtag_id, date_bucket, mentions_count)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (hashtag_id, date_bucket) DO UPDATE SET mentions_count = hashtag_analytics.mentions_count + 1
      `, [hashtagId]);

      // Calculate velocity (Compare today vs yesterday)
      const statsRes = await db.query(`
        SELECT date_bucket, mentions_count FROM hashtag_analytics 
        WHERE hashtag_id = $1 AND date_bucket >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY date_bucket DESC
      `, [hashtagId]);

      let todayMentions = 0;
      let yesterdayMentions = 0;

      statsRes.rows.forEach(r => {
        const d = new Date(r.date_bucket);
        const today = new Date();
        if (d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCDate() === today.getUTCDate()) {
          todayMentions = r.mentions_count;
        } else {
          yesterdayMentions = r.mentions_count;
        }
      });

      const velocity = calculateVelocity(todayMentions, yesterdayMentions);
      const isBreakout = velocity >= 500 && todayMentions >= 5; // Needs at least 5 mentions to be breakout

      // Update analytics with velocity
      await db.query(`
        UPDATE hashtag_analytics 
        SET velocity_percentage = $1, is_breakout = $2
        WHERE hashtag_id = $3 AND date_bucket = CURRENT_DATE
      `, [velocity, isBreakout, hashtagId]);
    }

    jobLogger.info('Intelligence job completed successfully');
  } catch (err: any) {
    jobLogger.error({ err: err.message }, 'Intelligence job failed');
    throw err;
  }
}

// Worker Initialization
let intelligenceWorker: Worker<IntelligenceJobDTO> | null = null;

export function startIntelligenceWorker() {
  if (intelligenceWorker) return;
  intelligenceWorker = new Worker<IntelligenceJobDTO>('intelligenceQueue', processIntelligenceJob, { connection: redis });
  
  intelligenceWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Intelligence worker job failed');
  });

  logger.info('🧠 Intelligence Worker started');
}

export async function stopIntelligenceWorker() {
  if (intelligenceWorker) {
    await intelligenceWorker.close();
    logger.info('Intelligence Worker stopped');
  }
}
