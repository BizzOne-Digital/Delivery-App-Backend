import "dotenv/config";
import mongoose from "mongoose";
import serverless from "serverless-http";

let slsHandler;

async function getHandler() {
  if (slsHandler) return slsHandler;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in Vercel → Environment Variables.");
  }

  if (!globalThis.__mongoPromise) {
    globalThis.__mongoPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  await globalThis.__mongoPromise;

  const { createApp } = await import("../dist/createHttpApp.js");
  slsHandler = serverless(createApp());
  return slsHandler;
}

export default async function handler(req, res) {
  try {
    const fn = await getHandler();
    return fn(req, res);
  } catch (err) {
    console.error("API bootstrap failed:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : "Server failed to start",
      }),
    );
  }
}
