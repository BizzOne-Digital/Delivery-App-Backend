import { Router } from "express";
import { z } from "zod";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyDriverMessage } from "../models/PharmacyDriverMessage.js";
import { User } from "../models/User.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import {
  notifyDriverPharmacyMessage,
  notifyPharmacyStaffDriverMessage,
} from "../services/pushNotificationService.js";
import { UserRole } from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

const router = Router();

const PHARMACY_ROLES = [UserRole.PHARMACY_ADMIN, UserRole.PHARMACY_STAFF];

router.get("/conversations", authenticate, asyncHandler(async (req, res) => {
  const role = req.auth!.role;

  if (role === UserRole.DRIVER) {
    const msgs = await PharmacyDriverMessage.find({ driverUserId: req.auth!.id })
      .sort({ createdAt: -1 })
      .populate("pharmacyId", "name displayColor phone");
    const seen = new Set<string>();
    const conversations: unknown[] = [];
    for (const m of msgs) {
      const phId = String(m.pharmacyId?._id ?? m.pharmacyId);
      if (seen.has(phId)) continue;
      seen.add(phId);
      const unread = await PharmacyDriverMessage.countDocuments({
        pharmacyId: m.pharmacyId,
        driverUserId: req.auth!.id,
        senderRole: "PHARMACY",
        readByDriverAt: { $exists: false },
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

    const msgs = await PharmacyDriverMessage.find({ pharmacyId })
      .sort({ createdAt: -1 })
      .populate("driverUserId", "firstName lastName email phone");
    const seen = new Set<string>();
    const conversations: unknown[] = [];
    for (const m of msgs) {
      const did = String(m.driverUserId?._id ?? m.driverUserId);
      if (seen.has(did)) continue;
      seen.add(did);
      const unread = await PharmacyDriverMessage.countDocuments({
        pharmacyId,
        driverUserId: m.driverUserId,
        senderRole: "DRIVER",
        readByPharmacyAt: { $exists: false },
      });
      conversations.push({
        driverUserId: m.driverUserId,
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
  const driverUserId = req.query.driverUserId as string | undefined;
  const role = req.auth!.role;

  let filter: Record<string, unknown> = {};

  if (role === UserRole.DRIVER) {
    if (!pharmacyId) return sendError(res, "pharmacyId required", 400);
    filter = { pharmacyId, driverUserId: req.auth!.id };
    await PharmacyDriverMessage.updateMany(
      { ...filter, senderRole: "PHARMACY", readByDriverAt: { $exists: false } },
      { $set: { readByDriverAt: new Date() } },
    );
  } else if ((PHARMACY_ROLES as string[]).includes(role)) {
    if (!driverUserId) return sendError(res, "driverUserId required", 400);
    if (!req.auth!.pharmacyId) return sendError(res, "Pharmacy not linked", 400);
    filter = { pharmacyId: req.auth!.pharmacyId, driverUserId };
    await PharmacyDriverMessage.updateMany(
      { ...filter, senderRole: "DRIVER", readByPharmacyAt: { $exists: false } },
      { $set: { readByPharmacyAt: new Date() } },
    );
  } else {
    return sendError(res, "Forbidden", 403);
  }

  const items = await PharmacyDriverMessage.find(filter).sort({ createdAt: 1 }).limit(200);
  sendSuccess(res, items);
}));

router.post("/", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    pharmacyId: z.string().optional(),
    driverUserId: z.string().optional(),
    body: z.string().min(1).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid message", 400);

  const role = req.auth!.role;
  const body = parsed.data.body.trim();

  if (role === UserRole.DRIVER) {
    const pharmacyId = parsed.data.pharmacyId;
    if (!pharmacyId) return sendError(res, "pharmacyId required", 400);
    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy?.active) return sendError(res, "Pharmacy not found", 404);

    const msg = await PharmacyDriverMessage.create({
      pharmacyId,
      driverUserId: req.auth!.id,
      senderUserId: req.auth!.id,
      senderRole: "DRIVER",
      body,
      readByDriverAt: new Date(),
    });

    const driver = await User.findById(req.auth!.id);
    const name = driver ? `${driver.firstName} ${driver.lastName}`.trim() : "Driver";
    void notifyPharmacyStaffDriverMessage(pharmacyId, String(req.auth!.id), name, body).catch(console.error);
    return sendSuccess(res, msg, 201);
  }

  if ((PHARMACY_ROLES as string[]).includes(role)) {
    const driverUserId = parsed.data.driverUserId;
    if (!driverUserId || !req.auth!.pharmacyId) {
      return sendError(res, "driverUserId required", 400);
    }
    const pharmacy = await Pharmacy.findById(req.auth!.pharmacyId);
    if (!pharmacy) return sendError(res, "Pharmacy not found", 404);

    const msg = await PharmacyDriverMessage.create({
      pharmacyId: req.auth!.pharmacyId,
      driverUserId,
      senderUserId: req.auth!.id,
      senderRole: "PHARMACY",
      body,
      readByPharmacyAt: new Date(),
    });

    void notifyDriverPharmacyMessage(
      driverUserId,
      String(pharmacy._id),
      pharmacy.name,
      body,
    ).catch(console.error);
    return sendSuccess(res, msg, 201);
  }

  return sendError(res, "Forbidden", 403);
}));

export default router;
