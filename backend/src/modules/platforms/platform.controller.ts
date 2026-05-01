import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';
import { NotFoundError } from '../../shared/exceptions';

// GET /api/v1/platforms
export async function getPlatforms(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(`
      SELECT p.*,
        json_agg(
          json_build_object(
            'id', tr.id, 'metric_name', tr.metric_name,
            'operator', tr.operator, 'threshold_value', tr.threshold_value,
            'is_active', tr.is_active
          )
        ) FILTER (WHERE tr.id IS NOT NULL) AS threshold_rules
      FROM platforms p
      LEFT JOIN threshold_rules tr ON tr.platform_id = p.id
      GROUP BY p.id
      ORDER BY p.id
    `);
    res.json(successResponse(result.rows));
  } catch (err) { next(err); }
}

// GET /api/v1/platforms/:slug
export async function getPlatformBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT * FROM platforms WHERE slug = $1`,
      [req.params.slug]
    );
    if (!result.rows[0]) return next(new NotFoundError(`Platform '${req.params.slug}'`));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}
