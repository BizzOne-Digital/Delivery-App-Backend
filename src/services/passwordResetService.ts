import crypto from "crypto";
import { env } from "../config/env.js";
import { PasswordResetCode } from "../models/PasswordResetCode.js";
import { User } from "../models/User.js";
import { hashPassword, revokeRefreshToken } from "./authService.js";
import { sendPasswordResetOtpEmail } from "./emailService.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";

const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function otpSecret(): string {
  return env.JWT_ACCESS_SECRET;
}

function hashOtp(code: string): string {
  return crypto.createHmac("sha256", otpSecret()).update(code).digest("hex");
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function requestPasswordResetOtp(email: string): Promise<{ delivered: boolean; devOtp?: string }> {
  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized, active: true });
  if (!user) {
    return { delivered: false };
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await PasswordResetCode.findOneAndUpdate(
    { email: normalized },
    { codeHash: hashOtp(code), expiresAt, verifyAttempts: 0 },
    { upsert: true, new: true },
  );

  let delivered = false;
  try {
    const result = await sendPasswordResetOtpEmail(normalized, code);
    delivered = result.delivered;
  } catch (err) {
    console.error("OTP email failed:", err);
  }

  if (!delivered && env.NODE_ENV !== "production") {
    console.info(`[password-reset] OTP for ${normalized}: ${code}`);
  }

  const devOtp =
    env.NODE_ENV !== "production" && !delivered ? code : undefined;

  return { delivered, devOtp };
}

export async function resetPasswordWithOtp(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const policy = passwordPolicyError(newPassword);
  if (policy) return { ok: false, error: policy };

  const normalized = email.toLowerCase().trim();
  const record = await PasswordResetCode.findOne({ email: normalized });
  if (!record || record.expiresAt < new Date()) {
    if (record) await PasswordResetCode.deleteOne({ _id: record._id });
    return { ok: false };
  }

  if ((record.verifyAttempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    await PasswordResetCode.deleteOne({ _id: record._id });
    return { ok: false, error: "Too many invalid codes. Request a new code." };
  }

  if (record.codeHash !== hashOtp(code.trim())) {
    record.verifyAttempts = (record.verifyAttempts ?? 0) + 1;
    await record.save();
    return { ok: false };
  }

  const user = await User.findOne({ email: normalized, active: true });
  if (!user) return { ok: false };

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeRefreshToken(String(user._id));
  await PasswordResetCode.deleteOne({ _id: record._id });
  return { ok: true };
}
