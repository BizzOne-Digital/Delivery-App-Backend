import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "./dist/createHttpApp.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is missing.");
}

if (!globalThis.__mongoPromise) {
  globalThis.__mongoPromise = mongoose.connect(uri);
}
await globalThis.__mongoPromise;

const app = createApp();
const server = http.createServer(app);
server.listen(Number(process.env.PORT ?? 5000), "0.0.0.0", () => {
  console.log(`API listening on port ${process.env.PORT ?? 5000}`);
});
