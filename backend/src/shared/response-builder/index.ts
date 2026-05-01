// ── Structured API response builders ────────────────────────────────────────

export interface Meta {
  nextCursor?: string;
  limit?: number;
  count?: number;
  [key: string]: unknown;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: Meta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function successResponse<T>(data: T, meta?: Meta): SuccessResponse<T> {
  const res: SuccessResponse<T> = { success: true, data };
  if (meta) res.meta = meta;
  return res;
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown
): ErrorResponse {
  return {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
}
