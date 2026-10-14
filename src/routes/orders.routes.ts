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
  redactOrderForDriver,
} from "../services/orderVisibility.js";
import {
  buildPlannerDayLabels,
  canDriverSeeScheduledOrder,
  getNextSevenDayKeys,
  isInRollingPlannerWeek,
  isScheduledForTomorrow,
  orderPlannerDayKey,
  serializeScheduledOrder,
  tomorrowDayKey,
} from "../services/driverScheduleService.js";
import {
  filterReadyOrdersForDriver,
  mapPharmacyForDriver,
  parseDriverCoordinates,
  pharmaciesInDriverReach,
} from "../services/driverReachService.js";
import { env } from "../config/env.js";
import { writeAudit } from "../services/auditService.js";
import { buildOrderListFilter, canAccessOrder, findOrderByIdOrReference } from "../services/orderAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pharmacyDistanceKm } from "../services/zoneService.js";
import {
  notifyPatientOrderStatusChange,
  notifyPharmacyNewOrder,
  notifyPharmacyOrderStatusChange,
  notifyDriversOrderReady,
} from "../services/pushNotificationService.js";
import { ensureShiftStarted, maybeCloseShiftAfterDelivery } from "../services/driverShiftService.js";
import { mergeStatusTimestamps } from "../services/orderStatusTimestamps.js";
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
  sendSuccess(res, items.map((o) => serializeOrder(o)), 200, { total, page: Number(page), limit: Number(limit) });
}));

router.get("/driver/ready", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const coords = parseDriverCoordinates(req.query.lat, req.query.lng);
  if (!coords) {
    return sendError(res, "lat and lng query parameters are required", 400);
  }

  const pharmacies = await pharmaciesInDriverReach(driver.companyId, coords.lat, coords.lng);
  const pharmacyIds = pharmacies.map((p) => p._id);
  const orders = await Order.find({
    pharmacyId: { $in: pharmacyIds },
    status: OrderStatus.READY,
  });

  const groupedMap = filterReadyOrdersForDriver(orders, driver, pharmacies, coords.lat, coords.lng);
  const grouped: Record<string, unknown[]> = {};
  for (const [pharmacyId, list] of groupedMap.entries()) {
    grouped[pharmacyId] = list.map((order) => {
      const owned =
        String(order.assignedDriverId) === String(driver._id) && Boolean(order.claimedAt);
      return redactOrderForDriver(order, driver, owned);
    });
  }

  const payload = pharmacies.map((p) => {
    const mapped = mapPharmacyForDriver(p, coords.lat, coords.lng);
    const readyCount = grouped[String(p._id)]?.length ?? 0;
    return { ...mapped, readyCount };
  });

  sendSuccess(res, {
    radiusKm: env.PHARMACY_NEARBY_RADIUS_KM,
    pharmacies: payload,
    grouped,
  });
}));

router.get("/driver/tomorrow", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const coords = parseDriverCoordinates(req.query.lat, req.query.lng);
  if (!coords) return sendError(res, "lat and lng query parameters are required", 400);

  const pharmacies = await pharmaciesInDriverReach(driver.companyId, coords.lat, coords.lng);
  const pharmacyIds = pharmacies.map((p) => p._id);
  const orders = await Order.find({
    pharmacyId: { $in: pharmacyIds },
    status: { $nin: [OrderStatus.CANCELLED, OrderStatus.COMPLETED] },
  })
    .populate("customerId", "firstName lastName")
    .populate("pharmacyId", "name displayColor");

  const tomorrowKey = tomorrowDayKey();
  const grouped: Record<string, unknown[]> = {};
  for (const order of orders) {
    if (!isScheduledForTomorrow(order)) continue;
    const pharmacy = pharmacies.find((p) => String(p._id) === String(order.pharmacyId));
    if (!pharmacy || !canDriverSeeScheduledOrder(order, pharmacy, coords.lat, coords.lng)) continue;
    const key = String(order.pharmacyId);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(serializeScheduledOrder(order, driver));
  }

  const tomorrowLabel = buildPlannerDayLabels().find((d) => d.key === tomorrowKey)?.label ?? "Tomorrow";

  const payload = pharmacies.map((p) => {
    const mapped = mapPharmacyForDriver(p, coords.lat, coords.lng);
    const list = grouped[String(p._id)] ?? [];
    return { ...mapped, tomorrowCount: list.length };
  });

  sendSuccess(res, {
    radiusKm: env.PHARMACY_NEARBY_RADIUS_KM,
    tomorrowKey,
    tomorrowLabel,
    pharmacies: payload,
    grouped,
  });
}));

router.get("/driver/week", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driver = req.auth!.user!;
  const coords = parseDriverCoordinates(req.query.lat, req.query.lng);
  if (!coords) return sendError(res, "lat and lng query parameters are required", 400);

  const pharmacies = await pharmaciesInDriverReach(driver.companyId, coords.lat, coords.lng);
  const pharmacyIds = pharmacies.map((p) => p._id);
  const orders = await Order.find({
    pharmacyId: { $in: pharmacyIds },
    status: { $nin: [OrderStatus.CANCELLED, OrderStatus.COMPLETED] },
  })
    .populate("customerId", "firstName lastName")
    .populate("pharmacyId", "name displayColor");

  const dayKeys = getNextSevenDayKeys();
  const byPharmacy: Record<string, Record<string, unknown[]>> = {};
  for (const p of pharmacies) {
    const id = String(p._id);
    byPharmacy[id] = {};
    for (const k of dayKeys) byPharmacy[id][k] = [];
  }

  for (const order of orders) {
    if (!isInRollingPlannerWeek(order)) continue;
    const pharmacy = pharmacies.find((p) => String(p._id) === String(order.pharmacyId));
    if (!pharmacy || !canDriverSeeScheduledOrder(order, pharmacy, coords.lat, coords.lng)) continue;
    const phId = String(order.pharmacyId);
    const day = orderPlannerDayKey(order);
    if (!byPharmacy[phId]?.[day]) continue;
    byPharmacy[phId][day].push(serializeScheduledOrder(order, driver));
  }

  const payload = pharmacies.map((p) => {
    const mapped = mapPharmacyForDriver(p, coords.lat, coords.lng);
    const days = byPharmacy[String(p._id)] ?? {};
    const weekCount = Object.values(days).reduce((n, list) => n + list.length, 0);
    return { ...mapped, weekCount };
  });

  sendSuccess(res, {
    radiusKm: env.PHARMACY_NEARBY_RADIUS_KM,
    days: buildPlannerDayLabels(),
    pharmacies: payload,
    byPharmacy,
  });
}));

/** Active runs for this driver — ON_THE_WAY only (Deliveries tab). */
router.get("/driver/deliveries", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const driverId = req.auth!.id;
  const orders = await Order.find({
    assignedDriverId: driverId,
    status: OrderStatus.ON_THE_WAY,
  })
    .sort({ updatedAt: -1 })
    .populate("pharmacyId", "name displayColor code")
    .populate("customerId", "firstName lastName phone");
  sendSuccess(res, orders.map((o) => serializeOrder(o)));
}));

router.post("/claim", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const schema = z.object({
    orderIds: z.array(z.string()).min(1),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "orderIds required", 400);
  const driverCoords =
    parsed.data.lat != null && parsed.data.lng != null
      ? { lat: parsed.data.lat, lng: parsed.data.lng }
      : undefined;
  const results = await claimOrdersAtomic(req.auth!.user!, parsed.data.orderIds, driverCoords);
  const failed = results.filter((r) => !r.success);
  if (failed.length === results.length) {
    return sendError(res, "Could not claim orders", 409, "CLAIM_CONFLICT");
  }
  sendSuccess(res, { results });
}));

const PHARMACY_ORDER_ROLES = [UserRole.PHARMACY_ADMIN, UserRole.PHARMACY_STAFF];

async function findOrCreateCustomerForPharmacyOrder(
  companyId: mongoose.Types.ObjectId,
  pharmacyId: mongoose.Types.ObjectId,
  patient: { firstName: string; lastName: string; phone: string; email?: string },
  deliveryAddress: string,
  deliveryCoordinates: { latitude: number; longitude: number },
) {
  const phone = patient.phone.trim();
  let customer = await Customer.findOne({ companyId, phone, active: true });
  if (!customer) {
    customer = await Customer.create({
      companyId,
      pharmacyIds: [pharmacyId],
      firstName: patient.firstName.trim(),
      lastName: patient.lastName.trim(),
      phone,
      email: patient.email?.trim().toLowerCase(),
      addresses: [
        {
          label: "Delivery",
          line1: deliveryAddress,
          city: "",
          province: "",
          postalCode: "",
          latitude: deliveryCoordinates.latitude,
          longitude: deliveryCoordinates.longitude,
        },
      ],
      active: true,
    });
    return customer;
  }

  const linked = customer.pharmacyIds.some((id) => String(id) === String(pharmacyId));
  if (!linked) customer.pharmacyIds.push(pharmacyId);
  customer.firstName = patient.firstName.trim();
  customer.lastName = patient.lastName.trim();
  if (patient.email) customer.email = patient.email.trim().toLowerCase();
  await customer.save();
  return customer;
}

router.post("/", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    pharmacyId: z.string(),
    customerId: z.string().optional(),
    patient: z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().min(8),
        email: z.string().email().optional(),
      })
      .optional(),
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

  const role = req.auth!.role;
  let customerId = parsed.data.customerId;

  if ((PHARMACY_ORDER_ROLES as string[]).includes(role)) {
    if (!req.auth!.pharmacyId || String(pharmacy._id) !== req.auth!.pharmacyId) {
      return sendError(res, "Forbidden", 403);
    }
    if (!customerId) {
      if (!parsed.data.patient) {
        return sendError(res, "Patient details required", 400);
      }
      const customer = await findOrCreateCustomerForPharmacyOrder(
        pharmacy.companyId,
        pharmacy._id,
        parsed.data.patient,
        parsed.data.deliveryAddress,
        parsed.data.deliveryCoordinates,
      );
      customerId = String(customer._id);
    }
  } else if (role === UserRole.PATIENT) {
    if (!customerId) return sendError(res, "Customer required", 400);
    const customer = await Customer.findOne({ _id: customerId, userId: req.auth!.id });
    if (!customer) return sendError(res, "Forbidden", 403);
    const { latitude, longitude } = parsed.data.deliveryCoordinates;
    const km = pharmacyDistanceKm(pharmacy, latitude, longitude);
    if (km > env.PHARMACY_NEARBY_RADIUS_KM) {
      return sendError(
        res,
        `Delivery address must be within ${env.PHARMACY_NEARBY_RADIUS_KM} km of the pharmacy`,
        400,
      );
    }
  } else {
    return sendError(res, "Forbidden", 403);
  }

  if (!customerId) return sendError(res, "Customer required", 400);

  const order = await Order.create({
    referenceNumber: genRef(),
    companyId: pharmacy.companyId,
    pharmacyId: pharmacy._id,
    customerId,
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

  void notifyPatientOrderStatusChange(order, "").catch((err) => {
    console.error("Patient push notification failed:", err);
  });
  void notifyPharmacyNewOrder(order, req.auth!.role).catch((err) => {
    console.error("Pharmacy new-order notification failed:", err);
  });

  sendSuccess(res, order, 201);
}));

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcCalendarDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ensure planner fields are present on API responses (legacy rows). */
function serializeOrder(order: { toObject?: () => Record<string, unknown> }) {
  const o = typeof order.toObject === "function" ? order.toObject() : { ...(order as Record<string, unknown>) };
  if (o.deliveryDayConfirmed && !o.deliveryDay && o.deliveryDate) {
    o.deliveryDay = utcCalendarDayKey(new Date(o.deliveryDate as string | Date));
  }
  return o;
}

function dateFromDayKey(key: string): Date {
  const parts = key.split("-").map((n) => Number(n));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function isAllowedDeliveryDayKey(key: string): boolean {
  const parts = key.split("-").map((n) => Number(n));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return false;
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  // Slight cushion for client local "today" vs UTC (e.g. UTC+5)
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 6);
  return target >= start && target <= end;
}

router.patch("/:id/delivery-date", authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    deliveryDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    deliveryDate: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid date", 400);

  const order = await findOrderByIdOrReference(String(req.params.id ?? ""));
  if (!order) return sendError(res, "Order not found", 404);
  if (!(await canAccessOrder(req.auth!, order))) {
    return sendError(res, "Forbidden", 403);
  }

  const role = req.auth!.role;
  const canSetDate = (
    [
      UserRole.PHARMACY_ADMIN,
      UserRole.PHARMACY_STAFF,
      UserRole.COMPANY_ADMIN,
      UserRole.DISPATCHER,
      UserRole.SUPER_ADMIN,
    ] as string[]
  ).includes(role);
  if (!canSetDate) return sendError(res, "Forbidden", 403);

  let dayKey: string | null = parsed.data.deliveryDay ?? null;
  if (!dayKey && parsed.data.deliveryDate) {
    const d = new Date(parsed.data.deliveryDate);
    if (Number.isNaN(d.getTime())) return sendError(res, "Invalid date", 400);
    dayKey = localDayKey(d);
  }
  if (!dayKey) return sendError(res, "deliveryDay required", 400);
  if (!isAllowedDeliveryDayKey(dayKey)) {
    return sendError(res, "Delivery date must be within the next 7 days", 400);
  }

  order.deliveryDate = dateFromDayKey(dayKey);
  order.deliveryDay = dayKey;
  order.deliveryDayConfirmed = true;
  order.updatedBy = new mongoose.Types.ObjectId(req.auth!.id);
  await order.save();

  await writeAudit({
    companyId: order.companyId,
    actorId: new mongoose.Types.ObjectId(req.auth!.id),
    action: "ORDER_DELIVERY_DATE",
    entityType: "Order",
    entityId: order._id,
    metadata: { deliveryDate: order.deliveryDate.toISOString(), deliveryDay: dayKey },
  });

  sendSuccess(res, serializeOrder(order));
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
  const order = await findOrderByIdOrReference(String(req.params.id ?? ""));
  if (!order) return sendError(res, "Order not found", 404);

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

  const previousStatus = order.status;
  order.status = status;
  order.statusTimestamps = mergeStatusTimestamps(order, status);
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

  void notifyPatientOrderStatusChange(order, previousStatus).catch((err) => {
    console.error("Patient push notification failed:", err);
  });
  void notifyPharmacyOrderStatusChange(order, previousStatus).catch((err) => {
    console.error("Pharmacy order status notification failed:", err);
  });
  if (order.status === OrderStatus.READY && previousStatus !== OrderStatus.READY) {
    void notifyDriversOrderReady(order).catch((err) => {
      console.error("Driver new-order notification failed:", err);
    });
  }

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
  sendSuccess(res, serializeOrder(order));
}));

router.get("/:id", authenticate, asyncHandler(async (req, res) => {
  const order = await findOrderByIdOrReference(String(req.params.id ?? ""));
  if (!order) return sendError(res, "Order not found", 404);
  await order.populate("customerId", "firstName lastName phone");
  await order.populate("pharmacyId", "name displayColor code");
  if (!(await canAccessOrder(req.auth!, order))) {
    return sendError(res, "Forbidden", 403);
  }
  sendSuccess(res, serializeOrder(order));
}));

export default router;
