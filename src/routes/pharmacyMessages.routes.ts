import { Router } from "express";
import { z } from "zod";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyMessage } from "../models/PharmacyMessage.js";
import { User } from "../models/User.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import {
  notifyPatientPharmacyMessage,
  notifyPharmacyStaffPatientMessage,
} from "../services/pushNotificationService.js";
import { UserRole } from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

const router = Router();

const PHARMACY_ROLES = [UserRole.PHARMACY_ADMIN, UserRole.PHARMACY_STAFF];

router.get("/conversations", authenticate, asyncHandler(async (req, res) => {
  const role = req.auth!.role;

  if (role === UserRole.PATIENT) {
    const msgs = await PharmacyMessage.find({ patientUserId: req.auth!.id })
      .sort({ createdAt: -1 })
      .populate("pharmacyId", "name displayColor phone");
    const seen = new Set<string>();
    const conversations: unknown[] = [];
    for (const m of msgs) {
      const phId = String(m.pharmacyId?._id ?? m.pharmacyId);
      if (seen.has(phId)) continue;
      seen.add(phId);
      const unread = await PharmacyMessage.countDocuments({
        pharmacyId: m.pharmacyId,
        patientUserId: req.auth!.id,
        senderRole: "PHARMACY",
        readByPatientAt: { $exists: false },
      });
      conversations.push({
        pharmacyId: m.pharmacyId,
        lastMessage: m.body,
        lastAt: m.createdAt,
        unreadCount: unread,
      });
    }
    return sendSuccess(res, conversations);
  }

  if ((PHARMACY_ROLES as string[]).includes(role)) {
    const pharmacyId = req.auth!.pharmacyId;
    if (!pharmacyId) return sendError(res, "Pharmacy not linked", 400);

    const msgs = await PharmacyMessage.find({ pharmacyId })
      .sort({ createdAt: -1 })
      .populate("patientUserId", "firstName lastName email");
    const seen = new Set<string>();
    const conversations: unknown[] = [];
    for (const m of msgs) {
      const pid = String(m.patientUserId?._id ?? m.patientUserId);
      if (seen.has(pid)) continue;
      seen.add(pid);
      const unread = await PharmacyMessage.countDocuments({
        pharmacyId,
        patientUserId: m.patientUserId,
        senderRole: "PATIENT",
        readByPharmacyAt: { $exists: false },
      });
      conversations.push({
        patientUserId: m.patientUserId,
        lastMessage: m.body,
        lastAt: m.createdAt,
        unreadCount: unread,
      });
    }
    return sendSuccess(res, conversations);
  }

  return sendError(res, "Forbidden", 403);
}));

router.get("/thread", authenticate, asyncHandler(async (req, res) => {
  const pharmacyId = req.query.pharmacyId as string | undefined;
  const patientUserId = req.query.patientUserId as string | undefined;
  const role = req.auth!.role;

  let filter: Record<string, unknown> = {};

  if (role === UserRole.PATIENT) {
    if (!pharmacyId) return sendError(res, "pharmacyId required", 400);
    filter = { pharmacyId, patientUserId: req.auth!.id };
    await PharmacyMessage.updateMany(
      { ...filter, senderRole: "PHARMACY", readByPatientAt: { $exists: false } },
      { $set: { readByPatientAt: new Date() } },
    );
  } else if ((PHARMACY_ROLES as string[]).includes(role)) {
    if (!patientUserId) return sendError(res, "patientUserId required", 400);
    if (!req.auth!.pharmacyId) return sendError(res, "Pharmacy not linked", 400);
    filter = { pharmacyId: req.auth!.pharmacyId, patientUserId };
    await PharmacyMessage.updateMany(
      { ...filter, senderRole: "PATIENT", readByPharmacyAt: { $exists: false } },
      { $set: { readByPharmacyAt: new Date() } },
    );
  } else {
    return sendError(res, "Forbidden", 403);
  }

  const items = await PharmacyMessage.find(filter).sort({ createdAt: 1 }).limit(200);
  sendSuccess(res, items);
}));

router.post("/", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    pharmacyId: z.string().optional(),
    patientUserId: z.string().optional(),
    orderId: z.string().optional(),
    body: z.string().min(1).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid message", 400);

  const role = req.auth!.role;
  const body = parsed.data.body.trim();

  if (role === UserRole.PATIENT) {
    const pharmacyId = parsed.data.pharmacyId;
    if (!pharmacyId) return sendError(res, "pharmacyId required", 400);
    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy?.active) return sendError(res, "Pharmacy not found", 404);

    const msg = await PharmacyMessage.create({
      pharmacyId,
      patientUserId: req.auth!.id,
      orderId: parsed.data.orderId,
      senderUserId: req.auth!.id,
      senderRole: "PATIENT",
      body,
      readByPatientAt: new Date(),
    });

    const patient = await User.findById(req.auth!.id);
    const name = patient ? `${patient.firstName} ${patient.lastName}`.trim() : "Patient";
    void notifyPharmacyStaffPatientMessage(pharmacyId, String(req.auth!.id), name, body).catch(console.error);
    return sendSuccess(res, msg, 201);
  }

  if ((PHARMACY_ROLES as string[]).includes(role)) {
    const patientUserId = parsed.data.patientUserId;
    if (!patientUserId || !req.auth!.pharmacyId) {
      return sendError(res, "patientUserId required", 400);
    }
    const pharmacy = await Pharmacy.findById(req.auth!.pharmacyId);
    if (!pharmacy) return sendError(res, "Pharmacy not found", 404);

    const msg = await PharmacyMessage.create({
      pharmacyId: req.auth!.pharmacyId,
      patientUserId,
      orderId: parsed.data.orderId,
      senderUserId: req.auth!.id,
      senderRole: "PHARMACY",
      body,
      readByPharmacyAt: new Date(),
    });

    void notifyPatientPharmacyMessage(
      patientUserId,
      String(pharmacy._id),
      pharmacy.name,
      body,
    ).catch(console.error);
    return sendSuccess(res, msg, 201);
  }

  return sendError(res, "Forbidden", 403);
}));

export default router;
