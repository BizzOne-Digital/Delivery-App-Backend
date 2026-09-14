import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "./dist/app.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is missing. Set it in Vercel → Environment Variables.");
}

if (!globalThis.__mongoPromise) {
  globalThis.__mongoPromise = mongoose.connect(uri);
}
await globalThis.__mongoPromise;

const app = createApp();
const server = http.createServer(app);

const port = Number(process.env.PORT ?? 3000);
server.listen(port);
