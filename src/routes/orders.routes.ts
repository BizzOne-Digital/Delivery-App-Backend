import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { Customer } from "../models/Customer.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { OrderStatus, PaymentMethod, UserRole } from "../types/enums.js";
import { claimOrdersAtomic } from "../services/orderClaimService.js";
import {
  canDriverSeeOrderPreview,
  isWithinScheduleVisibility,
  redactOrderForDriver,
} from "../services/orderVisibility.js";
import { writeAudit } from "../services/auditService.js";
import { buildOrderListFilter, canAccessOrder } from "../services/orderAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureShiftStarted, maybeCloseShiftAfterDelivery } from "../services/driverShiftService.js";
const router = Router();

function genRef() {
  return `JD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

router.get("/", authenticate, asyncHandler(async (req, res) => {
  const { status, pharmacyId, driverId, from, to, page = "1", limit = "20" } = req.query;
  const filter: Record<string, unknown> = await buildOrderListFilter(req.auth!);

  if (status) filter.status = status;
  if (pharmacyId && req.auth!.role !== UserRole.DRIVER && req.auth!.role !== UserRole.PATIENT) {
    filter.pharmacyId = pharmacyId;
  }
  if (driverId && req.auth!.role !== UserRole.DRIVER) {
    filter.assignedDriverId = driverId;
  }
  if (from || to) {
    filter.deliveryDate = {};
    if (from) (filter.deliveryDate as Record<string, Date>).$gte = new Date(String(from));
    if (to) (filter.deliveryDate as Record<string, Date>).$lte = new Date(String(to));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ deliveryDate: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("customerId", "firstName lastName")
      .populate("pharmacyId", "name displayColor code"),
    Order.countDocuments(filter),
  ]);
  sendSuccess(res, items, 200, { total, page: Number(page), limit: Number(limit) });
}));

router.get("/driver/ready", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const pharmacies = await Pharmacy.find({
    linkedDriverIds: driver._id,
    active: true,
  });
  const pharmacyIds = pharmacies.map((p) => p._id);
  const orders = await Order.find({
    pharmacyId: { $in: pharmacyIds },
    status: OrderStatus.READY,
  });

  const grouped: Record<string, unknown[]> = {};
  for (const order of orders) {
    const pharmacy = pharmacies.find((p) => String(p._id) === String(order.pharmacyId));
    if (!pharmacy || !canDriverSeeOrderPreview(order, driver, pharmacy)) continue;
    const owned =
      String(order.assignedDriverId) === String(driver._id) && Boolean(order.claimedAt);
    const key = String(order.pharmacyId);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(redactOrderForDriver(order, driver, owned));
  }
  sendSuccess(res, { pharmacies, grouped });
}));

router.get("/driver/tomorrow", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const pharmacies = await Pharmacy.find({ linkedDriverIds: driver._id, active: true });
  const orders = await Order.find({
    pharmacyId: { $in: pharmacies.map((p) => p._id) },
    deliveryDate: { $gte: start, $lte: end },
    status: { $nin: [OrderStatus.CANCELLED, OrderStatus.COMPLETED] },
  })
    .populate("pharmacyId", "name displayColor address latitude longitude")
    .populate("customerId", "firstName lastName");

  const visible = orders.filter((o) => {
    const ph = pharmacies.find((p) => String(p._id) === String(o.pharmacyId));
    return ph && canDriverSeeOrderPreview(o, driver, ph);
  });
  sendSuccess(res, visible);
}));

router.get("/driver/week", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const pharmacies = await Pharmacy.find({ linkedDriverIds: driver._id, active: true });
  const orders = await Order.find({
    pharmacyId: { $in: pharmacies.map((p) => p._id) },
    deliveryDate: { $gte: new Date(), $lte: end },
    status: { $nin: [OrderStatus.CANCELLED, OrderStatus.COMPLETED] },
  });
  const visible = orders.filter((o) => {
    const ph = pharmacies.find((p) => String(p._id) === String(o.pharmacyId));
    return ph && isWithinScheduleVisibility(o.deliveryDate) && canDriverSeeOrderPreview(o, driver, ph);
  });
  sendSuccess(res, visible);
}));

router.post("/claim", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const schema = z.object({ orderIds: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "orderIds required", 400);
  const results = await claimOrdersAtomic(req.auth!.user!, parsed.data.orderIds);
  const failed = results.filter((r) => !r.success);
  if (failed.length === results.length) {
    return sendError(res, "Could not claim orders", 409, "CLAIM_CONFLICT");
  }
  sendSuccess(res, { results });
}));

router.post("/", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    pharmacyId: z.string(),
    customerId: z.string(),
    deliveryDate: z.string(),
    deliveryAddress: z.string(),
    deliveryCoordinates: z.object({ latitude: z.number(), longitude: z.number() }),
    priority: z.string().optional(),
    amountDue: z.number().optional(),
    orderNotes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid order", 400);

  const pharmacy = await Pharmacy.findById(parsed.data.pharmacyId);
  if (!pharmacy?.active) return sendError(res, "Pharmacy not available", 400);

  if (req.auth!.role === UserRole.PATIENT) {
    const customer = await Customer.findOne({ _id: parsed.data.customerId, userId: req.auth!.id });
    if (!customer) return sendError(res, "Forbidden", 403);
  }

  const order = await Order.create({
    referenceNumber: genRef(),
    companyId: pharmacy.companyId,
    pharmacyId: pharmacy._id,
    customerId: parsed.data.customerId,
    status: OrderStatus.ACTION_REQUIRED,
    deliveryDate: new Date(parsed.data.deliveryDate),
    priority: parsed.data.priority ?? "NORMAL",
    amountDue: parsed.data.amountDue ?? 0,
    orderNotes: parsed.data.orderNotes,
    pickupAddress: pharmacy.address,
    pickupCoordinates: { latitude: pharmacy.latitude, longitude: pharmacy.longitude },
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryCoordinates: parsed.data.deliveryCoordinates,
    createdBy: req.auth!.id,
    statusTimestamps: { ACTION_REQUIRED: new Date() },
  });

  sendSuccess(res, order, 201);
}));

router.patch("/:id/status", authenticate, asyncHandler(async (req, res) => {
  const { status, amountCollected, paymentMethod } = req.body as {
    status: string;
    amountCollected?: number;
    paymentMethod?: string;
  };
  if (!(Object.values(OrderStatus) as string[]).includes(status)) {
    return sendError(res, "Invalid status", 400);
  }
  const order = await Order.findById(req.params.id);
  if (!order) return sendError(res, "Not found", 404);

  if (!(await canAccessOrder(req.auth!, order))) {
    return sendError(res, "Forbidden", 403);
  }

  if (req.auth!.role === UserRole.DRIVER) {
    const driverId = String(req.auth!.id);
    if (String(order.assignedDriverId) !== driverId) {
      return sendError(res, "Forbidden", 403);
    }
    const driverAllowed: Partial<Record<string, string>> = {
      [OrderStatus.ON_THE_WAY]: OrderStatus.READY,
      [OrderStatus.COMPLETED]: OrderStatus.ON_THE_WAY,
    };
    const required = driverAllowed[status];
    if (!required || order.status !== required) {
      return sendError(res, `Cannot change status from ${order.status} to ${status}`, 400);
    }
    if (status === OrderStatus.ON_THE_WAY && !order.claimedAt) {
      return sendError(res, "Claim the order before starting delivery", 400);
    }
  } else {
    const allowedRoles: string[] = [
      UserRole.PHARMACY_ADMIN,
      UserRole.PHARMACY_STAFF,
      UserRole.COMPANY_ADMIN,
      UserRole.DISPATCHER,
      UserRole.SUPER_ADMIN,
    ];
    if (!allowedRoles.includes(req.auth!.role)) {
      return sendError(res, "Forbidden", 403);
    }
    const role = req.auth!.role;
    if (role === UserRole.PHARMACY_ADMIN || role === UserRole.PHARMACY_STAFF) {
      const allowedNext: Partial<Record<string, string[]>> = {
        [OrderStatus.ACTION_REQUIRED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
        [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
        [OrderStatus.READY]: [OrderStatus.PREPARING],
      };
      const next = allowedNext[order.status];
      if (!next?.includes(status)) {
        return sendError(res, `Cannot change status from ${order.status} to ${status}`, 400);
      }
    }
  }

  if (req.auth!.role === UserRole.DRIVER && status === OrderStatus.ON_THE_WAY) {
    await ensureShiftStarted(req.auth!.user!);
  }

  order.status = status;
  order.statusTimestamps = { ...order.statusTimestamps, [status]: new Date() };
  order.updatedBy = new mongoose.Types.ObjectId(req.auth!.id);
  if (status === OrderStatus.READY && order.rateSnapshot) {
    order.estimatedClientCharge = order.rateSnapshot.totalClientCharge;
  }
  if (status === OrderStatus.COMPLETED && req.auth!.role === UserRole.DRIVER) {
    if (order.amountDue > 0) {
      order.amountCollected = amountCollected ?? order.amountDue;
      order.paymentMethod = paymentMethod ?? PaymentMethod.CASH;
    }
  }
  await order.save();

  if (req.auth!.role === UserRole.DRIVER && status === OrderStatus.COMPLETED) {
    await maybeCloseShiftAfterDelivery(req.auth!.user!);
  }
  await writeAudit({
    companyId: order.companyId,
    actorId: new mongoose.Types.ObjectId(req.auth!.id),
    action: "ORDER_STATUS",
    entityType: "Order",
    entityId: order._id,
    metadata: { status },
  });
  sendSuccess(res, order);
}));

router.get("/:id", authenticate, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return sendError(res, "Not found", 404);
  if (!(await canAccessOrder(req.auth!, order))) {
    return sendError(res, "Forbidden", 403);
  }
  sendSuccess(res, order);
}));

export default router;
