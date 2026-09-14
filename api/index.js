import "dotenv/config";
import mongoose from "mongoose";

let slsHandler;

function requestPath(req) {
  const raw = req.url ?? "/";
  return raw.split("?")[0] ?? "/";
}

function isHealthPath(path) {
  return path === "/api/v1/health" || path === "/api/v1/health/";
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in Vercel → Environment Variables.");
  }
  if (mongoose.connection.readyState === 1) return;

  if (!globalThis.__mongoPromise) {
    globalThis.__mongoPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 5,
      })
      .catch((err) => {
        globalThis.__mongoPromise = undefined;
        throw err;
      });
  }
  await globalThis.__mongoPromise;
}

async function getHandler() {
  if (slsHandler) return slsHandler;

  await connectMongo();

  const serverless = (await import("serverless-http")).default;
  const { createApp } = await import("../dist/createHttpApp.js");
  slsHandler = serverless(createApp());
  return slsHandler;
}

function healthResponse(res) {
  let db = "disconnected";
  if (!process.env.MONGODB_URI) {
    db = "missing_uri";
  } else if (mongoose.connection.readyState === 1) {
    db = "connected";
  } else if (!globalThis.__mongoPromise) {
    globalThis.__mongoPromise = connectMongo().catch((err) => {
      console.error("Background Mongo connect failed:", err);
      globalThis.__mongoPromise = undefined;
    });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      success: true,
      data: { status: "ok", db },
    }),
  );
}

export default async function handler(req, res) {
  const path = requestPath(req);

  if (isHealthPath(path) && req.method === "GET") {
    healthResponse(res);
    return;
  }

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
