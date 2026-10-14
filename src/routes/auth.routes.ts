import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { PharmacyApplication } from "../models/PharmacyApplication.js";
import { PharmacyApplicationStatus } from "../types/enums.js";
import {
  hashPassword,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  storeRefreshTokenHash,
  validateRefreshToken,
  verifyPassword,
} from "../services/authService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { authenticate } from "../middleware/auth.js";
import { Company } from "../models/Company.js";
import { DriverOnboardingStatus, UserRole } from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid credentials payload", 400);
  const email = parsed.data.email.toLowerCase();
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    const pending = await PharmacyApplication.findOne({
      email,
      status: PharmacyApplicationStatus.PENDING,
    });
    if (pending) {
      return sendError(
        res,
        "Your pharmacy application is under review. We will email you when it is approved.",
        403,
        "PHARMACY_APPLICATION_PENDING",
      );
    }
    const rejected = await PharmacyApplication.findOne({
      email,
      status: PharmacyApplicationStatus.REJECTED,
    }).sort({ createdAt: -1 });
    if (rejected) {
      return sendError(
        res,
        rejected.rejectionReason ?? "Your pharmacy application was not approved.",
        403,
        "PHARMACY_APPLICATION_REJECTED",
      );
    }
    return sendError(res, "Invalid email or password", 401);
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return sendError(res, "Invalid email or password", 401);
  }
  if (!user.active) return sendError(res, "Account disabled", 403);
  user.lastLoginAt = new Date();
  await user.save();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(String(user._id));
  await storeRefreshTokenHash(String(user._id), refreshToken);
  sendSuccess(res, {
    accessToken,
    refreshToken,
    user: await User.findById(user._id).select("-passwordHash"),
  });
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const token = req.body.refreshToken as string;
  if (!token) return sendError(res, "Refresh token required", 400);
  try {
    const { verifyRefreshToken } = await import("../services/authService.js");
    const payload = verifyRefreshToken(token);
    const valid = await validateRefreshToken(payload.sub, token);
    if (!valid) return sendError(res, "Invalid refresh token", 401);
    const user = await User.findById(payload.sub);
    if (!user?.active) return sendError(res, "User disabled", 403);
    const accessToken = signAccessToken(user);
    const newRefresh = signRefreshToken(String(user._id));
    await storeRefreshTokenHash(String(user._id), newRefresh);
    sendSuccess(res, { accessToken, refreshToken: newRefresh });
  } catch {
    sendError(res, "Invalid refresh token", 401);
  }
}));

router.post("/logout", authenticate, asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.auth!.id);
  sendSuccess(res, { ok: true });
}));

router.get("/me", authenticate, asyncHandler(async (req, res) => {
  sendSuccess(res, req.auth!.user);
}));

router.post("/me/push-token", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({ token: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid push token", 400);

  const user = await User.findById(req.auth!.id);
  if (!user) return sendError(res, "Not found", 404);

  const token = parsed.data.token.trim();
  const tokens = user.expoPushTokens ?? [];
  if (!tokens.includes(token)) {
    user.expoPushTokens = [...tokens, token].slice(-5);
    await user.save();
  }
  sendSuccess(res, { ok: true });
}));

router.patch("/me", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(8).optional(),
    notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid profile data", 400);
  const user = await User.findById(req.auth!.id);
  if (!user) return sendError(res, "Not found", 404);
  if (parsed.data.firstName) user.firstName = parsed.data.firstName;
  if (parsed.data.lastName) user.lastName = parsed.data.lastName;
  if (parsed.data.phone) user.phone = parsed.data.phone;
  if (parsed.data.notificationPreferences) {
    user.notificationPreferences = {
      ...user.notificationPreferences,
      ...parsed.data.notificationPreferences,
    };
  }
  await user.save();
  sendSuccess(res, await User.findById(user._id).select("-passwordHash"));
}));

router.delete("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth!.id);
  if (!user) return sendError(res, "Not found", 404);
  user.active = false;
  await user.save();
  await revokeRefreshToken(req.auth!.id);
  sendSuccess(res, { ok: true, message: "Account deactivated. Contact support to restore." });
}));

router.post("/register-driver", asyncHandler(async (req, res) => {
  const schema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string(),
    password: z.string().min(8),
    vehicleType: z.string(),
    licensePlate: z.string(),
    termsAccepted: z.literal(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid registration", 400);
  const exists = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (exists) return sendError(res, "Email already registered", 409);
  const passwordHash = await hashPassword(parsed.data.password);
  const company = await Company.findOne().sort({ createdAt: 1 });
  const user = await User.create({
    ...parsed.data,
    email: parsed.data.email.toLowerCase(),
    passwordHash,
    role: UserRole.DRIVER,
    companyId: company?._id,
    active: true,
    onboardingStatus: DriverOnboardingStatus.APPROVED,
    driverStatus: "OFFLINE",
  });
  sendSuccess(res, { userId: user._id }, 201);
}));

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = (req.body as { email?: string }).email;
  if (!email) return sendError(res, "Email required", 400);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return sendSuccess(res, { message: "If the account exists, reset instructions were sent." });
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[dev] Password reset requested for", user.email);
  }
  sendSuccess(res, { message: "If the account exists, reset instructions were sent." });
}));

router.post("/change-password", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid payload", 400);
  const user = await User.findById(req.auth!.id).select("+passwordHash");
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return sendError(res, "Current password incorrect", 400);
  }
  user.passwordHash = await hashPassword(parsed.data.newPassword);
  await user.save();
  sendSuccess(res, { ok: true });
}));

export default router;
