import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/database';
import { successResponse } from '../../shared/response-builder';
import { NotFoundError, ValidationError } from '../../shared/exceptions';

// GET /api/v1/admin/threshold-rules
export async function getThresholdRules(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT tr.*, pl.slug AS platform_slug FROM threshold_rules tr JOIN platforms pl ON tr.platform_id = pl.id ORDER BY tr.platform_id, tr.metric_name`
    );
    res.json(successResponse(result.rows));
  } catch (err) { next(err); }
}

// POST /api/v1/admin/threshold-rules
export async function createThresholdRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { platform_id, metric_name, operator, threshold_value } = req.body;
    if (!platform_id || !metric_name || !threshold_value === undefined) {
      return next(new ValidationError('platform_id, metric_name, and threshold_value are required'));
    }
    const result = await db.query(
      `INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [platform_id, metric_name, operator ?? 'gte', threshold_value]
    );
    res.status(201).json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/threshold-rules/:id
export async function updateThresholdRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { threshold_value, operator, is_active } = req.body;
    const result = await db.query(
      `UPDATE threshold_rules
       SET threshold_value = COALESCE($2, threshold_value),
           operator        = COALESCE($3, operator),
           is_active       = COALESCE($4, is_active)
       WHERE id = $1 RETURNING *`,
      [id, threshold_value, operator, is_active]
    );
    if (!result.rows[0]) return next(new NotFoundError('Threshold rule'));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// DELETE /api/v1/admin/threshold-rules/:id
export async function deleteThresholdRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `DELETE FROM threshold_rules WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return next(new NotFoundError('Threshold rule'));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// POST /api/v1/admin/platforms
export async function createPlatform(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, slug, scrape_interval_min, config } = req.body;
    if (!name || !slug) return next(new ValidationError('name and slug are required'));
    const result = await db.query(
      `INSERT INTO platforms (name, slug, scrape_interval_min, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, scrape_interval_min, config ? JSON.stringify(config) : null]
    );
    res.status(201).json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}

// PATCH /api/v1/admin/platforms/:slug
export async function updatePlatform(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    const { is_active, scrape_interval_min, config } = req.body;
    const result = await db.query(
      `UPDATE platforms
       SET is_active           = COALESCE($2, is_active),
           scrape_interval_min = COALESCE($3, scrape_interval_min),
           config              = COALESCE($4, config),
           updated_at          = NOW()
       WHERE slug = $1 RETURNING *`,
      [slug, is_active, scrape_interval_min, config ? JSON.stringify(config) : null]
    );
    if (!result.rows[0]) return next(new NotFoundError(`Platform '${slug}'`));
    res.json(successResponse(result.rows[0]));
  } catch (err) { next(err); }
}
