import serverless from "serverless-http";
import mongoose from "mongoose";
import { createApp } from "../dist/app.js";

async function connectMongo() {
  if (globalThis.__mongoConn) return globalThis.__mongoConn;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Add it in Vercel → Settings → Environment Variables.");
  }
  if (!globalThis.__mongoPromise) {
    globalThis.__mongoPromise = mongoose.connect(uri);
  }
  globalThis.__mongoConn = await globalThis.__mongoPromise;
  return globalThis.__mongoConn;
}

const expressApp = createApp();
const sls = serverless(expressApp);

export default async function handler(req, res) {
  await connectMongo();
  return sls(req, res);
}
