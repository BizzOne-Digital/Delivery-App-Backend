import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  CLIENT_URL: z.string().default("http://localhost:8081"),
  UPLOAD_BASE_URL: z.string().default("http://localhost:5000"),
  SEED_PASSWORD: z.string().optional(),
  CLAIM_WINDOW_HOURS_BEFORE: z.coerce.number().default(24),
  DRIVER_SCHEDULE_VISIBILITY_DAYS: z.coerce.number().default(7),
  GPS_STALE_THRESHOLD_MINUTES: z.coerce.number().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.message).join("; ");
  console.error("Environment validation failed:", missing);
  if (process.env.NODE_ENV !== "test") {
    process.exit(1);
  }
}

export const env = parsed.success
  ? parsed.data
  : {
      PORT: 5000,
      NODE_ENV: "test" as const,
      MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/delivery-app",
      JWT_ACCESS_SECRET: "test-access-secret-min-16-chars",
      JWT_REFRESH_SECRET: "test-refresh-secret-min-16-chars",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "30d",
      CLIENT_URL: "http://localhost:8081",
      UPLOAD_BASE_URL: "http://localhost:5000",
      SEED_PASSWORD: "dev",
      CLAIM_WINDOW_HOURS_BEFORE: 24,
      DRIVER_SCHEDULE_VISIBILITY_DAYS: 7,
      GPS_STALE_THRESHOLD_MINUTES: 5,
    };
