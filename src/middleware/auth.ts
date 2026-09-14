import type { Request, Response, NextFunction } from "express";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../services/authService.js";
import { sendError } from "../utils/apiResponse.js";
import type { UserRole } from "../types/enums.js";

export interface AuthUser {
  id: string;
  role: string;
  companyId?: string;
  pharmacyId?: string;
  user: Awaited<ReturnType<typeof loadUser>>;
}

async function loadUser(id: string) {
  return User.findById(id).select("-passwordHash -refreshTokenHash");
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return sendError(res, "Authentication required", 401, "UNAUTHORIZED");
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await loadUser(payload.sub);
    if (!user || !user.active) {
      return sendError(res, "User disabled or not found", 403, "FORBIDDEN");
    }
    req.auth = {
      id: String(user._id),
      role: user.role,
      companyId: user.companyId ? String(user.companyId) : undefined,
      pharmacyId: user.pharmacyId ? String(user.pharmacyId) : undefined,
      user,
    };
    next();
  } catch {
    return sendError(res, "Invalid or expired token", 401, "UNAUTHORIZED");
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return sendError(res, "Authentication required", 401);
    if (!roles.includes(req.auth.role as UserRole)) {
      return sendError(res, "Insufficient permissions", 403, "FORBIDDEN");
    }
    next();
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request.auth augmentation
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}
