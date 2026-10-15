import type { ConnectOptions } from "mongoose";
import { env } from "../config/env.js";

export function getMongoClientOptions(): ConnectOptions {
  const options: ConnectOptions = {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: env.MONGODB_MIN_POOL_SIZE,
    maxIdleTimeMS: 30_000,
    compressors: ["zlib"],
  };

  if (env.MONGODB_READ_PREFERENCE) {
    options.readPreference = env.MONGODB_READ_PREFERENCE;
  }

  return options;
}
