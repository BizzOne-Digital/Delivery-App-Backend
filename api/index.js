import "dotenv/config";
import mongoose from "mongoose";

let expressApp;

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
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1,
      })
      .catch((err) => {
        globalThis.__mongoPromise = undefined;
        throw err;
      });
  }
  await globalThis.__mongoPromise;
}

async function getExpressApp() {
  if (expressApp) return expressApp;
  await connectMongo();
  const { createApp } = await import("../dist/createHttpApp.js");
  expressApp = createApp();
  return expressApp;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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

  sendJson(res, 200, {
    success: true,
    data: { status: "ok", db },
  });
}

function runExpress(app, req, res) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(undefined);
    };
    res.on("finish", () => finish());
    res.on("close", () => finish());
    res.on("error", (err) => finish(err));
    try {
      app(req, res, (err) => finish(err));
    } catch (err) {
      finish(err);
    }
  });
}

// Warm Mongo on cold start so auth routes are not stuck behind first connect.
if (process.env.MONGODB_URI && !globalThis.__mongoPromise) {
  globalThis.__mongoPromise = connectMongo().catch((err) => {
    console.error("Startup Mongo connect failed:", err);
    globalThis.__mongoPromise = undefined;
  });
}

export default async function handler(req, res) {
  const path = requestPath(req);

  if (isHealthPath(path) && req.method === "GET") {
    healthResponse(res);
    return;
  }

  try {
    const app = await getExpressApp();
    await runExpress(app, req, res);
  } catch (err) {
    console.error("API request failed:", err);
    if (!res.writableEnded) {
      sendJson(res, 500, {
        success: false,
        error: {
          message: err instanceof Error ? err.message : "Server failed to start",
        },
      });
    }
  }
}
