import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/exceptions';
import { errorResponse } from '../shared/response-builder';
import { logger } from '../shared/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, path: req.path, message: err.message }, 'AppError');
    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
}
