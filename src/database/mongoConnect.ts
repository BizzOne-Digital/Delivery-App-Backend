import mongoose from "mongoose";
import { env } from "../config/env.js";
import { getMongoClientOptions } from "./mongoOptions.js";
import { ensureScaleIndexes } from "./scaleIndexes.js";
import { initOptionalShardConnections, shardConnectionSummary } from "./shardConnections.js";

export { getMongoClientOptions } from "./mongoOptions.js";

let primaryConnectPromise: Promise<void> | undefined;

/** Primary Mongoose connection (all app models). Use Atlas *mongos* URI when cluster is sharded. */
export async function connectPrimaryDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (!primaryConnectPromise) {
    primaryConnectPromise = mongoose
      .connect(env.MONGODB_URI, getMongoClientOptions())
      .then(async () => {
        await initOptionalShardConnections();
        await ensureScaleIndexes();
        const summary = shardConnectionSummary();
        console.info(
          `MongoDB ready (pool max ${env.MONGODB_MAX_POOL_SIZE}, shards: ${summary.total}, read: ${env.MONGODB_READ_PREFERENCE ?? "primary"})`,
        );
      })
      .catch((err) => {
        primaryConnectPromise = undefined;
        throw err;
      });
  }

  await primaryConnectPromise;
}
