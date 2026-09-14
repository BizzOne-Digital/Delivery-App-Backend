import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";
import { User, type IUser } from "../models/User.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: IUser): string {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      companyId: user.companyId ? String(user.companyId) : undefined,
      pharmacyId: user.pharmacyId ? String(user.pharmacyId) : undefined,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as {
    sub: string;
    role: string;
    companyId?: string;
    pharmacyId?: string;
  };
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; type: string };
}

export async function storeRefreshTokenHash(userId: string, refreshToken: string) {
  const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await User.findByIdAndUpdate(userId, { refreshTokenHash: hash });
}

export async function validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  const user = await User.findById(userId).select("+refreshTokenHash");
  if (!user?.refreshTokenHash) return false;
  const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  return user.refreshTokenHash === hash;
}

export async function revokeRefreshToken(userId: string) {
  await User.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
}
