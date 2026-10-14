import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Company } from "../models/Company.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyApplication } from "../models/PharmacyApplication.js";
import { User } from "../models/User.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { hashPassword } from "../services/authService.js";
import { sendPharmacyLoginCredentialsEmail } from "../services/emailService.js";
import { notifyAdminsNewPharmacyApplication } from "../services/pharmacyApplicationNotify.js";
import {
  DispatchMode,
  PharmacyApplicationStatus,
  UserRole,
} from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { generateTemporaryPassword, slugPharmacyCode } from "../utils/generatePassword.js";
import { isValidHexColor } from "../utils/pharmacyColors.js";
import { geocodePlace } from "../utils/geocodePlace.js";

const router = Router();

const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] as const;

const applySchema = z.object({
  pharmacyName: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  address: z.string().min(5),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  licenseNumber: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/", asyncHandler(async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid application data", 400);

  const email = parsed.data.email.toLowerCase();
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return sendError(res, "An account already exists for this email. Please sign in.", 409);
  }

  const pending = await PharmacyApplication.findOne({
    email,
    status: PharmacyApplicationStatus.PENDING,
  });
  if (pending) {
    return sendError(res, "You already have an application under review.", 409, "PHARMACY_APPLICATION_PENDING");
  }

  const company = await Company.findOne().sort({ createdAt: 1 });
  const application = await PharmacyApplication.create({
    ...parsed.data,
    email,
    companyId: company?._id,
    status: PharmacyApplicationStatus.PENDING,
  });

  void notifyAdminsNewPharmacyApplication(
    String(application._id),
    application.pharmacyName,
    application.email,
  ).catch((err) => console.error("Admin notify failed:", err));

  sendSuccess(res, { applicationId: application._id, status: application.status }, 201);
}));

router.get("/status", asyncHandler(async (req, res) => {
  const email = String(req.query.email ?? "").toLowerCase().trim();
  if (!email) return sendError(res, "Email required", 400);

  const application = await PharmacyApplication.findOne({ email })
    .sort({ createdAt: -1 })
    .select("status pharmacyName rejectionReason createdAt reviewedAt");

  if (!application) {
    return sendSuccess(res, { status: "NONE" });
  }

  sendSuccess(res, {
    status: application.status,
    pharmacyName: application.pharmacyName,
    rejectionReason: application.rejectionReason,
    submittedAt: application.createdAt,
    reviewedAt: application.reviewedAt,
  });
}));

router.get("/", authenticate, requireRoles(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (req.auth!.companyId && req.auth!.role !== UserRole.SUPER_ADMIN) {
    filter.companyId = req.auth!.companyId;
  }

  const items = await PharmacyApplication.find(filter).sort({ createdAt: -1 }).limit(100);
  sendSuccess(res, items);
}));

router.get("/:id", authenticate, requireRoles(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const application = await PharmacyApplication.findById(req.params.id);
  if (!application) return sendError(res, "Application not found", 404);
  if (
    req.auth!.companyId &&
    req.auth!.role !== UserRole.SUPER_ADMIN &&
    application.companyId &&
    String(application.companyId) !== req.auth!.companyId
  ) {
    return sendError(res, "Not found", 404);
  }
  sendSuccess(res, application);
}));

const approveSchema = z.object({
  password: z.string().min(8).optional(),
  pharmacyCode: z.string().min(2).max(24).optional(),
  displayColor: z.string().optional(),
});

router.post("/:id/approve", authenticate, requireRoles(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid approval data", 400);

  const application = await PharmacyApplication.findById(req.params.id);
  if (!application) return sendError(res, "Application not found", 404);
  if (application.status !== PharmacyApplicationStatus.PENDING) {
    return sendError(res, "Application is no longer pending", 400);
  }

  const companyId =
    req.auth!.companyId ??
    application.companyId ??
    (await Company.findOne().sort({ createdAt: 1 }))?._id;
  if (!companyId) return sendError(res, "No delivery company configured", 500);

  const email = application.email.toLowerCase();
  if (await User.findOne({ email })) {
    return sendError(res, "A user already exists for this email", 409);
  }

  let code = (parsed.data.pharmacyCode ?? slugPharmacyCode(application.pharmacyName)).toUpperCase();
  if (await Pharmacy.findOne({ companyId, code })) {
    code = `${code.slice(0, 16)}-${generateTemporaryPassword(4).toUpperCase()}`;
  }

  const displayColor =
    parsed.data.displayColor && isValidHexColor(parsed.data.displayColor)
      ? parsed.data.displayColor
      : "#3B82F6";

  const fullAddress = [application.address, application.city, application.province, application.postalCode]
    .filter(Boolean)
    .join(", ");
  const geocoded = await geocodePlace(fullAddress);
  const latitude = geocoded?.lat ?? 0;
  const longitude = geocoded?.lng ?? 0;

  const pharmacy = await Pharmacy.create({
    companyId,
    name: application.pharmacyName,
    code,
    displayColor,
    email: application.email,
    phone: application.phone,
    contactPerson: application.contactName,
    address: fullAddress,
    latitude,
    longitude,
    locationConfirmedAt: geocoded ? new Date() : undefined,
    serviceZones: [],
    dispatchMode: DispatchMode.HYBRID,
    active: true,
    createdBy: req.auth!.id,
  });

  const password = parsed.data.password ?? generateTemporaryPassword();
  const nameParts = application.contactName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "Pharmacy";
  const lastName = nameParts.slice(1).join(" ") || "Admin";

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone: application.phone,
    passwordHash: await hashPassword(password),
    role: UserRole.PHARMACY_ADMIN,
    companyId,
    pharmacyId: pharmacy._id,
    active: true,
    emailVerified: true,
  });

  application.status = PharmacyApplicationStatus.APPROVED;
  application.reviewedBy = new mongoose.Types.ObjectId(req.auth!.id);
  application.reviewedAt = new Date();
  application.approvedPharmacyId = pharmacy._id;
  application.approvedUserId = user._id;
  await application.save();

  void sendPharmacyLoginCredentialsEmail(
    application.email,
    application.pharmacyName,
    email,
    password,
  ).catch((err) => console.error("Email send failed:", err));

  sendSuccess(res, {
    pharmacyId: pharmacy._id,
    userId: user._id,
    loginEmail: email,
    temporaryPassword: parsed.data.password ? undefined : password,
  });
}));

router.post("/:id/reject", authenticate, requireRoles(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().min(3).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Rejection reason required", 400);

  const application = await PharmacyApplication.findById(req.params.id);
  if (!application) return sendError(res, "Application not found", 404);
  if (application.status !== PharmacyApplicationStatus.PENDING) {
    return sendError(res, "Application is no longer pending", 400);
  }

  application.status = PharmacyApplicationStatus.REJECTED;
  application.rejectionReason = parsed.data.reason;
  application.reviewedBy = new mongoose.Types.ObjectId(req.auth!.id);
  application.reviewedAt = new Date();
  await application.save();

  sendSuccess(res, application);
}));

export default router;
