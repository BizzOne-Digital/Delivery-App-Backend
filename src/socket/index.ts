import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { verifyAccessToken } from "../services/authService.js";
import { env } from "../config/env.js";
import { UserRole } from "../types/enums.js";

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Unauthorized"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as {
      sub: string;
      role: string;
      companyId?: string;
      pharmacyId?: string;
    };

    if (user.companyId) socket.join(`company:${user.companyId}`);
    if (user.pharmacyId) socket.join(`pharmacy:${user.pharmacyId}`);
    if (user.role === UserRole.DRIVER) socket.join(`driver:${user.sub}`);
    socket.join(`user:${user.sub}`);

    socket.on("order:subscribe", (orderId: unknown) => {
      if (typeof orderId !== "string" || !/^[a-f\d]{24}$/i.test(orderId)) return;
      socket.join(`order:${orderId}`);
    });
  });

  return io;
}

export type AppSocketServer = ReturnType<typeof initSocket>;
