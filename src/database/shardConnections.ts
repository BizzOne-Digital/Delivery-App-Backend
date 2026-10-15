import { createHash } from "crypto";
import mongoose, { type Connection } from "mongoose";
import { env } from "../config/env.js";
import { getMongoClientOptions } from "./mongoOptions.js";

/** Extra cluster URIs for manual horizontal split (optional). Primary data stays on MONGODB_URI. */
const extraConnections: Connection[] = [];

function parseShardUris(): string[] {
  const raw = env.MONGODB_SHARD_URIS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

export async function initOptionalShardConnections(): Promise<void> {
  const uris = parseShardUris();
  for (const uri of uris) {
    if (uri === env.MONGODB_URI) continue;
    const conn = mongoose.createConnection(uri, getMongoClientOptions());
    await conn.asPromise();
    extraConnections.push(conn);
  }
}

export function shardConnectionSummary(): { total: number; extra: number } {
  return { total: 1 + extraConnections.length, extra: extraConnections.length };
}

/** Stable shard bucket for routing (Atlas shard key should include companyId). */
export function companyShardIndex(companyId: string, bucketCount: number): number {
  if (bucketCount <= 1) return 0;
  const hash = createHash("sha256").update(String(companyId)).digest();
  return hash.readUInt32BE(0) % bucketCount;
}

export function getExtraShardConnections(): readonly Connection[] {
  return extraConnections;
}
