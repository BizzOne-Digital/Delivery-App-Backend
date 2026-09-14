import type { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json({ success: true, data, meta });
}

export function sendError(res: Response, message: string, status = 400, code?: string) {
  res.status(status).json({ success: false, error: { message, code } });
}
