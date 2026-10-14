import { Order } from "../models/Order.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyRatePlan } from "../models/PharmacyRatePlan.js";
import { UserRole, DriverOnboardingStatus, OrderStatus } from "../types/enums.js";
import type { IUser } from "../models/User.js";
import { calculateRateSnapshot } from "../utils/rateCalculator.js";
import { haversineKm } from "../utils/haversine.js";
import { canDriverSeeOrderPreview, canDriverSeeReadyOrder, isWithinClaimWindow } from "./orderVisibility.js";
import {
  canDriverSeeScheduledOrder,
  isDriverEarlyClaimForTomorrow,
  isScheduledForTomorrow,
} from "./driverScheduleService.js";
import { writeAudit } from "./auditService.js";
import { env } from "../config/env.js";

export class ClaimConflictError extends Error {
  constructor(message = "Another driver claimed this order") {
    super(message);
    this.name = "ClaimConflictError";
  }
}

export async function claimOrdersAtomic(
  driver: IUser,
  orderIds: string[],
  driverCoords?: { lat: number; lng: number },
) {
  if (driver.role !== UserRole.DRIVER) throw new Error("Not a driver");
  if (driver.onboardingStatus !== DriverOnboardingStatus.APPROVED || !driver.active) {
    throw new Error("Driver not approved");
  }
  if (driver.driverStatus !== "AVAILABLE" && driver.driverStatus !== "DELIVERING") {
    // allow claim when available or already delivering
  }

  const results: { orderId: string; success: boolean; error?: string }[] = [];

  for (const orderId of orderIds) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        results.push({ orderId, success: false, error: "Not found" });
        continue;
      }
      if (order.status !== OrderStatus.READY) {
        results.push({ orderId, success: false, error: "Order not ready" });
        continue;
      }
      if (order.claimedAt && order.assignedDriverId) {
        results.push({ orderId, success: false, error: "Already claimed" });
        continue;
      }

      const pharmacy = await Pharmacy.findById(order.pharmacyId);
      if (!pharmacy?.active) {
        results.push({ orderId, success: false, error: "Pharmacy inactive" });
        continue;
      }

      const assignedToOther =
        order.assignedDriverId && String(order.assignedDriverId) !== String(driver._id);
      if (assignedToOther) {
        results.push({ orderId, success: false, error: "Assigned to another driver" });
        continue;
      }

      const canSee = driverCoords
        ? canDriverSeeReadyOrder(order, driver, pharmacy, driverCoords.lat, driverCoords.lng) ||
          (order.status === OrderStatus.READY &&
            isScheduledForTomorrow(order) &&
            canDriverSeeScheduledOrder(order, pharmacy, driverCoords.lat, driverCoords.lng))
        : canDriverSeeOrderPreview(order, driver, pharmacy);
      if (!canSee) {
        results.push({ orderId, success: false, error: "Not eligible" });
        continue;
      }

      const claimWindow =
        order.assignedDriverId && String(order.assignedDriverId) === String(driver._id)
          ? true
          : isDriverEarlyClaimForTomorrow(order) ||
            isWithinClaimWindow(order.deliveryDate, env.CLAIM_WINDOW_HOURS_BEFORE);

      if (!claimWindow) {
        results.push({ orderId, success: false, error: "Claim window not open" });
        continue;
      }

      let rateSnapshot = order.rateSnapshot;
      if (!rateSnapshot && pharmacy.ratePlanId) {
        const plan = await PharmacyRatePlan.findById(pharmacy.ratePlanId);
        if (plan) {
          const dist = haversineKm(
            order.pickupCoordinates.latitude,
            order.pickupCoordinates.longitude,
            order.deliveryCoordinates.latitude,
            order.deliveryCoordinates.longitude,
          );
          rateSnapshot = calculateRateSnapshot(plan, dist, {
            urgent: order.priority === "URGENT",
          });
        }
      }

      const updated = await Order.findOneAndUpdate(
        {
          _id: orderId,
          status: OrderStatus.READY,
          $and: [{ $or: [{ claimedAt: { $exists: false } }, { claimedAt: null }] }],
          $or: [
            { assignedDriverId: { $exists: false } },
            { assignedDriverId: null },
            { assignedDriverId: driver._id },
          ],
        },
        {
          $set: {
            assignedDriverId: driver._id,
            claimedAt: new Date(),
            rateSnapshot,
            estimatedClientCharge: rateSnapshot?.totalClientCharge,
          },
          $inc: { version: 1 },
        },
        { new: true },
      );

      if (!updated) {
        results.push({ orderId, success: false, error: "Conflict" });
        continue;
      }

      await writeAudit({
        companyId: order.companyId,
        actorId: driver._id,
        action: "ORDER_CLAIMED",
        entityType: "Order",
        entityId: order._id,
        metadata: { referenceNumber: order.referenceNumber },
      });

      results.push({ orderId, success: true });
    } catch (e) {
      results.push({ orderId, success: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  return results;
}
