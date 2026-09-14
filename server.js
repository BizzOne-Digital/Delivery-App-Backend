import http from "node:http";
import mongoose from "mongoose";
import { createApp } from "./dist/createHttpApp.js";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is missing — set it in Vercel Environment Variables.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);
  const port = Number(process.env.PORT ?? 3000);

  server.listen(port, () => {
    console.log(`Delivery API listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
