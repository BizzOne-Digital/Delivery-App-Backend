import { env } from "../config/env.js";
import { DispatchMode, DriverOnboardingStatus, OrderStatus, UserRole } from "../types/enums.js";
import type { IOrder } from "../models/Order.js";
import type { IPharmacy } from "../models/Pharmacy.js";
import type { IUser } from "../models/User.js";
import { driverInZone } from "./zoneService.js";

export function canDriverSeeOrderPreview(order: IOrder, driver: IUser, pharmacy: IPharmacy): boolean {
  if (driver.role !== UserRole.DRIVER) return false;
  if (!driver.active) return false;
  if (driver.onboardingStatus !== DriverOnboardingStatus.APPROVED) return false;

  const linked = pharmacy.linkedDriverIds.some((id) => String(id) === String(driver._id));
  if (!linked && pharmacy.dispatchMode === DispatchMode.ASSIGNED) {
    return String(order.assignedDriverId) === String(driver._id);
  }

  if (order.status !== OrderStatus.READY && order.status !== OrderStatus.ON_THE_WAY) {
    if (order.status === OrderStatus.READY || order.assignedDriverId) {
      // scheduled ready in future
    } else {
      return false;
    }
  }

  const deliveryLat = order.deliveryCoordinates.latitude;
  const deliveryLng = order.deliveryCoordinates.longitude;
  if (!driverInZone(driver.serviceZones, deliveryLat, deliveryLng)) return false;

  const mode = pharmacy.dispatchMode;
  const isAssigned = order.assignedDriverId && String(order.assignedDriverId) === String(driver._id);
  const isClaimed = order.claimedAt && String(order.assignedDriverId) === String(driver._id);

  if (isClaimed || isAssigned) return true;

  if (mode === DispatchMode.ASSIGNED) {
    return Boolean(isAssigned);
  }
  if (mode === DispatchMode.OPEN_POOL) {
    return !order.assignedDriverId || !order.claimedAt;
  }
  // HYBRID
  if (isAssigned) return true;
  return !order.claimedAt;
}

export function isWithinClaimWindow(deliveryDate: Date, hoursBefore = env.CLAIM_WINDOW_HOURS_BEFORE): boolean {
  const now = Date.now();
  const delivery = deliveryDate.getTime();
  const windowMs = hoursBefore * 60 * 60 * 1000;
  return delivery - now <= windowMs;
}

export function isWithinScheduleVisibility(deliveryDate: Date, days = env.DRIVER_SCHEDULE_VISIBILITY_DAYS): boolean {
  const end = new Date();
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  return deliveryDate <= end;
}

export function redactOrderForDriver(order: IOrder, driver: IUser, owned: boolean) {
  const base = {
    _id: order._id,
    referenceNumber: order.referenceNumber,
    pharmacyId: order.pharmacyId,
    orderType: order.orderType,
    status: order.status,
    priority: order.priority,
    deliveryDate: order.deliveryDate,
    timeWindowStart: order.timeWindowStart,
    timeWindowEnd: order.timeWindowEnd,
    packageCount: order.packageCount,
    amountDue: owned ? order.amountDue : undefined,
    assignedDriverId: order.assignedDriverId,
    claimedAt: order.claimedAt,
    deliveryCoordinates: owned
      ? order.deliveryCoordinates
      : {
          latitude: Math.round(order.deliveryCoordinates.latitude * 100) / 100,
          longitude: Math.round(order.deliveryCoordinates.longitude * 100) / 100,
        },
    deliveryAddress: owned ? order.deliveryAddress : order.deliveryAddress.split(",")[0] + " (area)",
  };
  return base;
}
