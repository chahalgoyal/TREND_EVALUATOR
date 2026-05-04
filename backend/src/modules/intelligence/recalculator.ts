import cron from 'node-cron';
import { db } from '../../config/database';
import { logger } from '../../shared/logger';
import { calculateTimeDecayScore, calculateFinalTrendScore } from './algorithms';

/**
 * Trend Recalculator — Runs periodically to decay old posts.
 * As posts get older, their time-decay gravity increases, meaning their trend score
 * should mathematically drop so fresh posts can surface to the top.
 */
export function startTrendRecalculator(): void {
  logger.info('Starting Trend Recalculator scheduler');

  // Run every hour at the top of the hour (e.g. 1:00, 2:00)
  cron.schedule('0 * * * *', async () => {
    logger.info('⏳ Running hourly trend score recalculation (time-decay)...');
    try {
      // 1. Fetch all posts that have a score
      const res = await db.query(`
        SELECT p.id, p.likes, p.posted_at, ps.engagement_rate 
        FROM posts p
        JOIN post_scores ps ON p.id = ps.post_id
        WHERE p.deleted_at IS NULL
      `);

      if (res.rowCount === 0) return;

      let updatedCount = 0;

      // 2. Recalculate each score based on its NEW age
      for (const row of res.rows) {
        const timeDecayScore = calculateTimeDecayScore(row.engagement_rate, row.posted_at);
        const totalTrendScore = calculateFinalTrendScore(row.likes, timeDecayScore);

        await db.query(`
          UPDATE post_scores 
          SET time_decay_score = $1, total_trend_score = $2, calculated_at = NOW()
          WHERE post_id = $3
        `, [timeDecayScore, totalTrendScore, row.id]);

        updatedCount++;
      }

      logger.info(`✅ Trend Recalculation complete. Updated ${updatedCount} posts.`);
    } catch (err) {
      logger.error({ err }, 'Trend Recalculation error');
    }
  });

  logger.info('Trend Recalculator running (checks every hour)');
}
