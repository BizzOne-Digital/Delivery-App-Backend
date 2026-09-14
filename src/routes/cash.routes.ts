import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { Order } from "../models/Order.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyCashReturn } from "../models/PharmacyCashReturn.js";
import { OrderStatus, UserRole } from "../types/enums.js";
import { writeAudit } from "../services/auditService.js";

const router = Router();

/** Cash collected on completed deliveries not yet returned to pharmacy. */
router.get("/driver/pending", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driverId = req.auth!.id;
  const handedOff = await PharmacyCashReturn.find({ driverId }).select("orderIds");
  const handedOffIds = new Set(handedOff.flatMap((h) => h.orderIds.map(String)));

  const orders = await Order.find({
    assignedDriverId: driverId,
    status: OrderStatus.COMPLETED,
    amountDue: { $gt: 0 },
  }).populate("pharmacyId", "name code");

  const pending = orders.filter((o) => !handedOffIds.has(String(o._id)));
  const total = pending.reduce((s, o) => s + (o.amountCollected ?? o.amountDue ?? 0), 0);

  sendSuccess(res, {
    total,
    orders: pending.map((o) => ({
      _id: o._id,
      referenceNumber: o.referenceNumber,
      amountDue: o.amountDue,
      amountCollected: o.amountCollected ?? o.amountDue,
      pharmacyId: o.pharmacyId,
      pharmacy: o.pharmacyId,
    })),
  });
}));

router.post("/pharmacy-return", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const schema = z.object({
    pharmacyId: z.string(),
    orderIds: z.array(z.string()).min(1),
    pharmacySignatureName: z.string().min(2),
    returnedAt: z.string().optional(),
    driverNote: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid payload", 400);

  const pharmacy = await Pharmacy.findById(parsed.data.pharmacyId);
  if (!pharmacy) return sendError(res, "Pharmacy not found", 404);

  const orders = await Order.find({
    _id: { $in: parsed.data.orderIds },
    assignedDriverId: req.auth!.id,
    status: OrderStatus.COMPLETED,
  });
  if (orders.length !== parsed.data.orderIds.length) {
    return sendError(res, "Invalid orders for return", 400);
  }

  const totalAmount = orders.reduce((s, o) => s + (o.amountCollected ?? o.amountDue ?? 0), 0);
  const record = await PharmacyCashReturn.create({
    companyId: pharmacy.companyId,
    driverId: req.auth!.id,
    pharmacyId: pharmacy._id,
    orderIds: orders.map((o) => o._id),
    totalAmount,
    returnedAt: parsed.data.returnedAt ? new Date(parsed.data.returnedAt) : new Date(),
    pharmacySignatureName: parsed.data.pharmacySignatureName,
    driverNote: parsed.data.driverNote,
  });

  await writeAudit({
    companyId: pharmacy.companyId,
    actorId: new mongoose.Types.ObjectId(req.auth!.id),
    action: "CASH_RETURNED_TO_PHARMACY",
    entityType: "PharmacyCashReturn",
    entityId: record._id,
    metadata: { totalAmount, pharmacyId: pharmacy._id },
  });

  sendSuccess(res, record, 201);
}));

export default router;
