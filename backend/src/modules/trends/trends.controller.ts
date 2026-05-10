import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';

export async function getTrendingPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const platform = req.query.platform as string | undefined;

    const result = await db.query(`
      SELECT 
        p.id as post_id, 
        pl.slug as platform, 
        p.author_username,
        p.caption,
        p.likes, 
        p.comments,
        p.views,
        ps.engagement_rate, 
        ps.total_trend_score,
        p.posted_at
      FROM posts p 
      JOIN post_scores ps ON p.id = ps.post_id 
      JOIN platforms pl ON p.platform_id = pl.id 
      WHERE p.deleted_at IS NULL
        AND ($1::text IS NULL OR pl.slug = $1)
      ORDER BY ps.total_trend_score DESC 
      LIMIT $2
    `, [platform || null, Math.min(limit, 100)]);
    
    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
}

export async function getBreakoutHashtags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Only surface tags with >=5 mentions today so single-mention new tags
    // (which always get 1000% velocity since they have no yesterday data)
    // don't flood the breakout list.
    const result = await db.query(`
      SELECT 
        h.tag, 
        ha.mentions_count, 
        ha.velocity_percentage,
        ha.is_breakout
      FROM hashtag_analytics ha
      JOIN hashtags h ON ha.hashtag_id = h.id
      WHERE ha.date_bucket = CURRENT_DATE
        AND ha.mentions_count >= 5
      ORDER BY ha.velocity_percentage DESC 
      LIMIT 20
    `);
    
    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
}

export async function getTopHashtags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const days = parseInt(String(req.query.days || '7'), 10);

    // Deduplicated: aggregate across all date buckets — fixes the duplicate-tag
    // display issue where each day produced its own row per tag.
    const result = await db.query(`
      SELECT 
        h.tag,
        SUM(ha.mentions_count)::int as total_mentions,
        ROUND(MAX(ha.velocity_percentage), 2) as peak_velocity,
        COUNT(DISTINCT ha.date_bucket)::int as active_days
      FROM hashtag_analytics ha
      JOIN hashtags h ON ha.hashtag_id = h.id
      WHERE ha.date_bucket >= CURRENT_DATE - ($2 || ' days')::interval
      GROUP BY h.tag
      ORDER BY total_mentions DESC
      LIMIT $1
    `, [Math.min(limit, 200), days]);

    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
}

export async function getHashtagHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tag } = req.params;
    const normalizedTag = String(tag).toLowerCase();

    const hashtagRes = await db.query(`SELECT id FROM hashtags WHERE tag = $1`, [normalizedTag]);
    if (hashtagRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Hashtag not found' });
      return;
    }
    const hashtagId = hashtagRes.rows[0].id;

    // Get up to 30 days of history ordered chronologically
    const result = await db.query(`
      SELECT 
        TO_CHAR(date_bucket, 'YYYY-MM-DD') as date,
        mentions_count as mentions,
        velocity_percentage as velocity
      FROM hashtag_analytics
      WHERE hashtag_id = $1
      ORDER BY date_bucket ASC
      LIMIT 30
    `, [hashtagId]);
    
    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
}
