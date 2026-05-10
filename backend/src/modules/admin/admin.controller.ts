import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';

export async function getSystemStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Total posts scraped today
    const postsTodayRes = await db.query(`
      SELECT COUNT(*) as count 
      FROM posts 
      WHERE scraped_at >= CURRENT_DATE
    `);

    // Viral posts today (passed threshold)
    const viralPostsTodayRes = await db.query(`
      SELECT COUNT(*) as count 
      FROM posts 
      WHERE scraped_at >= CURRENT_DATE AND threshold_passed = true
    `);

    // We can also query Redis for BullMQ stats if needed, but for now just DB stats
    const stats = {
      postsScrapedToday: parseInt(postsTodayRes.rows[0].count, 10),
      viralPostsToday: parseInt(viralPostsTodayRes.rows[0].count, 10),
    };

    res.json(successResponse(stats));
  } catch (err) {
    next(err);
  }
}

export async function getAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(`
      SELECT pa.id, p.slug as platform, pa.username, pa.is_active, pa.last_used_at, pa.created_at
      FROM platform_accounts pa
      JOIN platforms p ON pa.platform_id = p.id
      ORDER BY pa.created_at DESC
    `);
    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { platform_slug, username, session_data } = req.body;
    
    if (!platform_slug || !username || !session_data) {
      res.status(400).json({ success: false, error: 'platform_slug, username, and session_data are required' });
      return;
    }

    // Get platform ID
    const platformRes = await db.query(`SELECT id FROM platforms WHERE slug = $1`, [platform_slug]);
    if (platformRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Platform not found' });
      return;
    }

    const result = await db.query(`
      INSERT INTO platform_accounts (platform_id, username, session_data)
      VALUES ($1, $2, $3)
      ON CONFLICT (platform_id, username) 
      DO UPDATE SET session_data = EXCLUDED.session_data, is_active = true, updated_at = NOW()
      RETURNING id, username, is_active, updated_at
    `, [platformRes.rows[0].id, username, session_data]);

    res.status(201).json(successResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
}
