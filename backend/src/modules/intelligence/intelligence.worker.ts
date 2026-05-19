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
import { notifyError } from '../../services/notification.service';

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
      if (data.isNewInsert) {
        const bucketDate = data.scrapedAt.split('T')[0]; // Extract YYYY-MM-DD

        for (const tag of data.hashtags) {
          // Find hashtag ID
          const hashtagRes = await db.query(`SELECT id FROM hashtags WHERE tag = $1`, [tag]);
          if (!hashtagRes.rows[0]) continue;
          const hashtagId = hashtagRes.rows[0].id;

          // Upsert correct date bucket
          await db.query(`
            INSERT INTO hashtag_analytics (hashtag_id, date_bucket, mentions_count)
            VALUES ($1, $2, 1)
            ON CONFLICT (hashtag_id, date_bucket) DO UPDATE SET mentions_count = hashtag_analytics.mentions_count + 1
          `, [hashtagId, bucketDate]);

          // Calculate velocity (Compare bucket date vs day before bucket date)
          const statsRes = await db.query(`
            SELECT 
              SUM(CASE WHEN date_bucket = $2::date THEN mentions_count ELSE 0 END) as today_count,
              SUM(CASE WHEN date_bucket = $2::date - INTERVAL '1 day' THEN mentions_count ELSE 0 END) as yesterday_count
            FROM hashtag_analytics 
            WHERE hashtag_id = $1 AND date_bucket >= $2::date - INTERVAL '1 day' AND date_bucket <= $2::date
          `, [hashtagId, bucketDate]);

          const todayMentions = parseInt(statsRes.rows[0].today_count || '0', 10);
          const yesterdayMentions = parseInt(statsRes.rows[0].yesterday_count || '0', 10);

          const velocity = calculateVelocity(todayMentions, yesterdayMentions);
          // Breakout: >150% growth AND at least 10 mentions AND grew by at least 5 mentions
          const isBreakout = velocity >= 150 
            && todayMentions >= 10 
            && (todayMentions - yesterdayMentions) >= 5;

          // Update analytics with velocity
          await db.query(`
            UPDATE hashtag_analytics 
            SET velocity_percentage = $1, is_breakout = $2
            WHERE hashtag_id = $3 AND date_bucket = $4
          `, [velocity, isBreakout, hashtagId, bucketDate]);
        }
      }

    jobLogger.info('Intelligence job completed');
  } catch (err: any) {
    jobLogger.error({ err: err.message }, 'Intelligence job failed');
    await notifyError('Intelligence Calculation Error', `Job ID: ${data.jobId}\nPost ID: ${data.postDbId}\nError: ${err.message}`);
    throw err;
  }
}

// Worker Initialization
let intelligenceWorker: Worker<IntelligenceJobDTO> | null = null;

export function startIntelligenceWorker() {
  if (intelligenceWorker) return;
  intelligenceWorker = new Worker<IntelligenceJobDTO>('intelligenceQueue', processIntelligenceJob, { connection: redis });
  
  intelligenceWorker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, 'intelligenceQueue: Job failed');
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      await notifyError('Intelligence Job FATAL', `Job ID: ${job.id} failed after all retries.\nError: ${err.message}`);
    }
  });

  logger.info('🧠 Intelligence Worker started');
}

export async function stopIntelligenceWorker() {
  if (intelligenceWorker) {
    await intelligenceWorker.close();
    logger.info('Intelligence Worker stopped');
  }
}
