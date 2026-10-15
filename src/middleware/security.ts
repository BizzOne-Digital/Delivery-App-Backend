import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { env } from "../config/env.js";

function scrubValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrubValue);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    out[key] = scrubValue(val);
  }
  return out;
}

/** Strip MongoDB operator keys from JSON bodies (NoSQL injection). */
export function sanitizeRequestBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = scrubValue(req.body);
  }
  next();
}

export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "no-referrer" },
});

export function assertProductionSecrets() {
  if (env.NODE_ENV !== "production") return;
  const weak = ["change", "secret", "password", "test", "dev"];
  for (const [name, val] of [
    ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
  ] as const) {
    if (val.length < 32) {
      throw new Error(`${name} must be at least 32 characters in production`);
    }
    const lower = val.toLowerCase();
    if (weak.some((w) => lower.includes(w))) {
      console.warn(`[security] ${name} looks weak — use a random generated secret in production`);
    }
  }
}
