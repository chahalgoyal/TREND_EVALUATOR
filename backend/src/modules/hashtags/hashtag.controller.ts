import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';
import { NotFoundError } from '../../shared/exceptions';

// GET /api/v1/hashtags
export async function getHashtags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { platform, from, to, sortBy = 'post_count', cursor, limit = '20' } = req.query as Record<string, string>;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (platform) {
      conditions.push(`EXISTS (
        SELECT 1 FROM post_hashtags ph
        JOIN platforms pl ON ph.platform_id = pl.id
        WHERE ph.hashtag_id = h.id AND pl.slug = $${idx++}
      )`);
      params.push(platform);
    }
    if (from) { conditions.push(`h.first_seen_at >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`h.last_seen_at <= $${idx++}`); params.push(to); }
    if (cursor) { conditions.push(`h.post_count < $${idx++}`); params.push(parseInt(cursor, 10)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderCol = sortBy === 'last_seen_at' ? 'h.last_seen_at DESC' : 'h.post_count DESC';

    const sql = `SELECT * FROM hashtags h ${where} ORDER BY ${orderCol} LIMIT $${idx}`;
    params.push(limitNum + 1);

    const result = await db.query(sql, params);
    const rows = result.rows;
    const hasMore = rows.length > limitNum;
    const data = hasMore ? rows.slice(0, limitNum) : rows;
    const nextCursor = hasMore ? String(data[data.length - 1].post_count) : undefined;

    res.json(successResponse(data, { limit: limitNum, count: data.length, nextCursor }));
  } catch (err) { next(err); }
}

// GET /api/v1/hashtags/:tag
export async function getHashtagByTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tag = (req.params.tag as string).toLowerCase().replace(/^#/, '');
    const result = await db.query(
      `SELECT h.*,
        json_object_agg(pl.slug, counts.cnt) AS platform_breakdown
       FROM hashtags h
       LEFT JOIN (
         SELECT ph.hashtag_id, ph.platform_id, COUNT(*) AS cnt
         FROM post_hashtags ph GROUP BY ph.hashtag_id, ph.platform_id
       ) counts ON counts.hashtag_id = h.id
       LEFT JOIN platforms pl ON pl.id = counts.platform_id
       WHERE h.tag = $1
       GROUP BY h.id`,
      [tag]
    );
    if (!result.rows[0]) return next(new NotFoundError(`Hashtag #${tag}`));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// GET /api/v1/hashtags/:tag/posts
export async function getHashtagPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tag = (req.params.tag as string).toLowerCase().replace(/^#/, '');
    const { platform, from, to, cursor, limit = '20' } = req.query as Record<string, string>;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const conditions: string[] = ['p.deleted_at IS NULL', 'h.tag = $1'];
    const params: unknown[] = [tag];
    let idx = 2;

    if (platform) { conditions.push(`pl.slug = $${idx++}`); params.push(platform); }
    if (from) { conditions.push(`p.scraped_at >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`p.scraped_at <= $${idx++}`); params.push(to); }
    if (cursor) { conditions.push(`p.scraped_at < $${idx++}`); params.push(cursor); }

    const sql = `
      SELECT p.*, pl.slug AS platform_slug
      FROM posts p
      JOIN post_hashtags ph ON ph.post_id = p.id
      JOIN hashtags h ON ph.hashtag_id = h.id
      JOIN platforms pl ON p.platform_id = pl.id
      WHERE ${conditions.join(' AND ')}
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
