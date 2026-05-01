import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/exceptions';

// GET /api/v1/posts
export async function getPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      platform, source, thresholdPassed, hashtag,
      minLikes, minComments, from, to,
      cursor, limit = '20',
    } = req.query as Record<string, string>;

    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const conditions: string[] = ['p.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (platform) { conditions.push(`pl.slug = $${idx++}`); params.push(platform); }
    if (source)   { conditions.push(`p.source_type = $${idx++}`); params.push(source); }
    if (thresholdPassed === 'true') { conditions.push(`p.threshold_passed = true`); }
    if (minLikes)  { conditions.push(`p.likes >= $${idx++}`); params.push(parseInt(minLikes, 10)); }
    if (minComments) { conditions.push(`p.comments >= $${idx++}`); params.push(parseInt(minComments, 10)); }
    if (from) { conditions.push(`p.scraped_at >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`p.scraped_at <= $${idx++}`); params.push(to); }
    if (cursor) { conditions.push(`p.scraped_at < $${idx++}`); params.push(cursor); }

    if (hashtag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM post_hashtags ph
        JOIN hashtags h ON ph.hashtag_id = h.id
        WHERE ph.post_id = p.id AND h.tag = $${idx++}
      )`);
      params.push(hashtag.toLowerCase().replace(/^#/, ''));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT p.*, pl.slug AS platform_slug,
        (SELECT json_agg(h.tag) FROM post_hashtags ph JOIN hashtags h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id) AS hashtags
      FROM posts p
      JOIN platforms pl ON p.platform_id = pl.id
      ${where}
      ORDER BY p.scraped_at DESC
      LIMIT $${idx}
    `;
    params.push(limitNum + 1);

    const result = await db.query(sql, params);
    const rows = result.rows;
    const hasMore = rows.length > limitNum;
    const data = hasMore ? rows.slice(0, limitNum) : rows;
    const nextCursor = hasMore ? data[data.length - 1].scraped_at : undefined;

    res.json(successResponse(data, { limit: limitNum, count: data.length, nextCursor }));
  } catch (err) { next(err); }
}

// GET /api/v1/posts/:id
export async function getPostById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT p.*, pl.slug AS platform_slug,
        (SELECT json_agg(h.tag) FROM post_hashtags ph JOIN hashtags h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id) AS hashtags
       FROM posts p JOIN platforms pl ON p.platform_id = pl.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );
    if (!result.rows[0]) return next(new NotFoundError('Post'));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// DELETE /api/v1/posts/:id  (admin only)
export async function deletePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.keyTier !== 'admin') return next(new ForbiddenError('Admin key required'));
    const { id } = req.params;
    const result = await db.query(
      `UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (!result.rows[0]) return next(new NotFoundError('Post'));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}
