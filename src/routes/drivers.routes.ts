import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { DriverOnboardingStatus, UserRole } from "../types/enums.js";
import { getTodayShift } from "../services/driverShiftService.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { hashPassword, revokeRefreshToken } from "../services/authService.js";
import { generateTemporaryPassword } from "../utils/generatePassword.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import { sendDriverLoginCredentialsEmail } from "../services/emailService.js";

const router = Router();

const ADMIN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.DISPATCHER,
] as const;

const driverCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(8),
  vehicleType: z.string().min(1),
  licensePlate: z.string().min(1),
  password: z.string().min(8).optional(),
  sendCredentialsEmail: z.boolean().optional(),
});

router.get("/me/shift-today", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const shift = await getTodayShift(req.auth!.id);
  sendSuccess(res, shift);
}));

router.patch(
  "/me/location",
  authenticate,
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, "Invalid coordinates", 400);

    const user = await User.findById(req.auth!.id);
    if (!user) return sendError(res, "Not found", 404);

    user.lastLatitude = parsed.data.latitude;
    user.lastLongitude = parsed.data.longitude;
    user.lastLocationAt = new Date();
    await user.save();

    sendSuccess(res, {
      latitude: user.lastLatitude,
      longitude: user.lastLongitude,
      lastLocationAt: user.lastLocationAt,
    });
  }),
);

router.get(
  "/",
  authenticate,
  requireRoles(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { role: UserRole.DRIVER, active: true };
    if (req.auth!.companyId && req.auth!.role !== UserRole.SUPER_ADMIN) {
      const companyId = req.auth!.companyId;
      filter.$or = [
        { companyId },
        { companyId: null },
        { companyId: { $exists: false } },
      ];
    }

    const drivers = await User.find(filter)
      .select(
        "firstName lastName email phone vehicleType licensePlate driverStatus lastLatitude lastLongitude lastLocationAt createdAt",
      )
      .sort({ createdAt: -1 })
      .limit(200);

    sendSuccess(res, drivers);
  }),
);

router.post(
  "/",
  authenticate,
  requireRoles(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = driverCreateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, "Invalid driver data", 400);

    const email = parsed.data.email.toLowerCase();
    if (await User.findOne({ email })) {
      return sendError(res, "Email already registered", 409);
    }

    const companyId =
      req.auth!.companyId ?? (await Company.findOne().sort({ createdAt: 1 }))?._id;
    const password = parsed.data.password ?? generateTemporaryPassword();
    if (parsed.data.password) {
      const policyErr = passwordPolicyError(parsed.data.password);
      if (policyErr) return sendError(res, policyErr, 400);
    }
    const sendEmail = parsed.data.sendCredentialsEmail !== false;

    const user = await User.create({
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      email,
      phone: parsed.data.phone.trim(),
      passwordHash: await hashPassword(password),
      role: UserRole.DRIVER,
      companyId,
      active: true,
      onboardingStatus: DriverOnboardingStatus.APPROVED,
      driverStatus: "OFFLINE",
      vehicleType: parsed.data.vehicleType.trim(),
      licensePlate: parsed.data.licensePlate.trim(),
      emailVerified: true,
    });

    let credentialsEmailSent = false;
    if (sendEmail) {
      try {
        const mail = await sendDriverLoginCredentialsEmail(
          email,
          `${user.firstName} ${user.lastName}`,
          email,
          password,
        );
        credentialsEmailSent = mail.delivered;
      } catch (err) {
        console.error("Driver credentials email failed:", err);
      }
    }

    sendSuccess(
      res,
      {
        userId: user._id,
        loginEmail: email,
        credentialsEmailSent,
        temporaryPassword: !credentialsEmailSent && !parsed.data.password ? password : undefined,
      },
      201,
    );
  }),
);

router.post(
  "/:id/email-credentials",
  authenticate,
  requireRoles(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select("+passwordHash");
    if (!user || user.role !== UserRole.DRIVER) return sendError(res, "Driver not found", 404);
    if (
      req.auth!.companyId &&
      req.auth!.role !== UserRole.SUPER_ADMIN &&
      user.companyId &&
      String(user.companyId) !== req.auth!.companyId
    ) {
      return sendError(res, "Not found", 404);
    }

    const password = generateTemporaryPassword();
    user.passwordHash = await hashPassword(password);
    await user.save();

    let credentialsEmailSent = false;
    try {
      const mail = await sendDriverLoginCredentialsEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
        user.email,
        password,
      );
      credentialsEmailSent = mail.delivered;
    } catch (err) {
      console.error("Driver credentials email failed:", err);
    }

    sendSuccess(res, {
      loginEmail: user.email,
      credentialsEmailSent,
      temporaryPassword: credentialsEmailSent ? undefined : password,
    });
  }),
);

router.delete(
  "/:id",
  authenticate,
  requireRoles(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== UserRole.DRIVER) return sendError(res, "Driver not found", 404);
    if (
      req.auth!.companyId &&
      req.auth!.role !== UserRole.SUPER_ADMIN &&
      user.companyId &&
      String(user.companyId) !== req.auth!.companyId
    ) {
      return sendError(res, "Not found", 404);
    }

    user.active = false;
    await user.save();
    await revokeRefreshToken(String(user._id));

    sendSuccess(res, { ok: true });
  }),
);

export default router;
