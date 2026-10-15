import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { sendError } from "../utils/apiResponse.js";

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip ?? "unknown";
}

function emailKey(req: Request): string {
  const raw = req.body?.email;
  if (typeof raw === "string" && raw.includes("@")) {
    return raw.toLowerCase().trim();
  }
  return "";
}

function ipAndEmailKey(req: Request): string {
  return `${clientIp(req)}:${emailKey(req) || "no-email"}`;
}

function rateLimitHandler(
  _req: Request,
  res: import("express").Response,
  message = "Too many attempts. Please wait and try again.",
) {
  sendError(res, message, 429, "RATE_LIMIT");
}

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: import("express").Response) => rateLimitHandler(req, res),
};

/** Brute-force protection: login attempts per IP + email */
export const loginRateLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: ipAndEmailKey,
  message: "Too many login attempts",
});

/** OTP / forgot-password email sends */
export const otpRequestRateLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipAndEmailKey,
  message: "Too many verification code requests",
});

/** OTP verify + new password */
export const passwordResetRateLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipAndEmailKey,
  message: "Too many password reset attempts",
});

/** Driver self-signup */
export const signupRateLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => clientIp(req),
  message: "Too many sign-up attempts from this network",
});

/** Token refresh abuse */
export const refreshRateLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => clientIp(req),
  message: "Too many session refresh attempts",
});

/** Authenticated password change */
export const changePasswordRateLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => clientIp(req),
  message: "Too many password change attempts",
});

/** Public read endpoints (e.g. application status) */
export const publicStatusRateLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => clientIp(req),
  message: "Too many requests",
});

/** Pharmacy partner application */
export const pharmacyApplyRateLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.mainContactEmail === "string"
        ? req.body.mainContactEmail.toLowerCase().trim()
        : emailKey(req);
    return `${clientIp(req)}:${email || "apply"}`;
  },
  message: "Too many application submissions",
});
