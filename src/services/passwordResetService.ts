import crypto from "crypto";
import { PasswordResetCode } from "../models/PasswordResetCode.js";
import { User } from "../models/User.js";
import { hashPassword } from "./authService.js";
import { sendPasswordResetOtpEmail } from "./emailService.js";

const OTP_TTL_MS = 15 * 60 * 1000;

function otpSecret(): string {
  return process.env.JWT_ACCESS_SECRET ?? "dev-otp-secret";
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
    { codeHash: hashOtp(code), expiresAt },
    { upsert: true, new: true },
  );

  let delivered = false;
  try {
    const result = await sendPasswordResetOtpEmail(normalized, code);
    delivered = result.delivered;
  } catch (err) {
    console.error("OTP email failed:", err);
  }

  if (!delivered) {
    console.info(`[password-reset] OTP for ${normalized}: ${code}`);
  }

  const devOtp =
    process.env.NODE_ENV !== "production" && !delivered ? code : undefined;

  return { delivered, devOtp };
}

export async function resetPasswordWithOtp(
  email: string,
  code: string,
  newPassword: string,
): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const record = await PasswordResetCode.findOne({ email: normalized });
  if (!record || record.expiresAt < new Date()) {
    if (record) await PasswordResetCode.deleteOne({ _id: record._id });
    return false;
  }

  if (record.codeHash !== hashOtp(code.trim())) {
    return false;
  }

  const user = await User.findOne({ email: normalized, active: true });
  if (!user) return false;

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await PasswordResetCode.deleteOne({ _id: record._id });
  return true;
}
