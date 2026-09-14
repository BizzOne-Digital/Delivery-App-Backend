import http from "http";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket/index.js";

async function main() {
  if (!env.MONGODB_URI.includes("delivery-app") && !env.MONGODB_URI.includes("127.0.0.1")) {
    console.warn("Ensure MongoDB database name is delivery-app in your URI.");
  }
  await mongoose.connect(env.MONGODB_URI);
  console.log("MongoDB connected");

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${env.PORT} is already in use. Stop the other backend (Ctrl+C in that terminal) or run:\n` +
          `  npx kill-port ${env.PORT}\n` +
          `Then run npm run dev again.`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API listening on http://0.0.0.0:${env.PORT} (LAN + emulator)`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
