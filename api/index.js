import mongoose from "mongoose";
import { createApp } from "../dist/createHttpApp.js";

let expressApp;

async function getApp() {
  if (expressApp) return expressApp;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in Vercel → Environment Variables.");
  }
  if (!globalThis.__mongoPromise) {
    globalThis.__mongoPromise = mongoose.connect(uri);
  }
  await globalThis.__mongoPromise;
  expressApp = createApp();
  return expressApp;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
