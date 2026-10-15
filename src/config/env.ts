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
  PHARMACY_NEARBY_RADIUS_KM: z.coerce.number().default(50),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().default(50),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().default(0),
  MONGODB_READ_PREFERENCE: z
    .enum(["primary", "primaryPreferred", "secondary", "secondaryPreferred", "nearest"])
    .optional(),
  /** Optional extra cluster URIs (comma-separated) for future multi-cluster routing */
  MONGODB_SHARD_URIS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.message).join("; ");
  const msg = `Environment validation failed: ${missing}`;
  console.error(msg);
  if (process.env.NODE_ENV !== "test") {
    if (process.env.VERCEL) {
      throw new Error(msg);
    }
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
      PHARMACY_NEARBY_RADIUS_KM: 50,
      MONGODB_MAX_POOL_SIZE: 50,
      MONGODB_MIN_POOL_SIZE: 0,
      MONGODB_READ_PREFERENCE: undefined,
      MONGODB_SHARD_URIS: undefined,
    };
