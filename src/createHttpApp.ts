import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env.js";
import { assertProductionSecrets, sanitizeRequestBody, securityHeaders } from "./middleware/security.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import pharmacyRoutes from "./routes/pharmacies.routes.js";
import orderRoutes from "./routes/orders.routes.js";
import customerRoutes from "./routes/customers.routes.js";
import cashRoutes from "./routes/cash.routes.js";
import driversRoutes from "./routes/drivers.routes.js";
import pharmacyApplicationsRoutes from "./routes/pharmacyApplications.routes.js";
import pharmacyMessagesRoutes from "./routes/pharmacyMessages.routes.js";
import pharmacyDriverMessagesRoutes from "./routes/pharmacyDriverMessages.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import { sendError } from "./utils/apiResponse.js";

export function createApp() {
  assertProductionSecrets();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(
    cors({
      origin:
        env.NODE_ENV === "development"
          ? true
          : [env.CLIENT_URL, "http://localhost:8081", "http://localhost:19006"],
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "512kb", strict: true }));
  app.use(sanitizeRequestBody);
  app.use("/uploads", express.static(path.resolve("uploads")));

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "Delivery App API",
      health: "/api/v1/health",
    });
  });

  app.use("/api/v1/health", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/pharmacies", pharmacyRoutes);
  app.use("/api/v1/orders", orderRoutes);
  app.use("/api/v1/customers", customerRoutes);
  app.use("/api/v1/cash", cashRoutes);
  app.use("/api/v1/drivers", driversRoutes);
  app.use("/api/v1/pharmacy-applications", pharmacyApplicationsRoutes);
  app.use("/api/v1/pharmacy-messages", pharmacyMessagesRoutes);
  app.use("/api/v1/pharmacy-driver-messages", pharmacyDriverMessagesRoutes);
  app.use("/api/v1/notifications", notificationsRoutes);

  app.use((_req, res) => sendError(res, "Not found", 404));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    sendError(res, "Internal server error", 500);
  });

  return app;
}
