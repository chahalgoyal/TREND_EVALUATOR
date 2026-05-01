import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthError, ForbiddenError } from '../shared/exceptions';

/**
 * Validates x-api-key header.
 * Attaches req.keyTier = 'standard' | 'admin' on success.
 */
declare global {
  namespace Express {
    interface Request {
      keyTier?: 'standard' | 'admin';
    }
  }
}

export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key) return next(new AuthError('Missing x-api-key header'));

  if (key === env.apiKeys.admin) {
    req.keyTier = 'admin';
    return next();
  }
  if (key === env.apiKeys.standard) {
    req.keyTier = 'standard';
    return next();
  }

  next(new AuthError('Invalid API key'));
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.keyTier !== 'admin') {
    return next(new ForbiddenError('Admin API key required'));
  }
  next();
}
