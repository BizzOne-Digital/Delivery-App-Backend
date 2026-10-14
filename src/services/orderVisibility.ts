import { DispatchMode, DriverOnboardingStatus, OrderStatus, UserRole } from "../types/enums.js";
import type { IOrder } from "../models/Order.js";
import type { IPharmacy } from "../models/Pharmacy.js";
import type { IUser } from "../models/User.js";
import { driverInZone, pharmacyWithinPatientRadius } from "./zoneService.js";
import { env } from "../config/env.js";

function driverApproved(driver: IUser) {
  return (
    driver.role === UserRole.DRIVER &&
    driver.active &&
    driver.onboardingStatus === DriverOnboardingStatus.APPROVED
  );
}

function isOrderOwnedByDriver(order: IOrder, driver: IUser) {
  return Boolean(order.assignedDriverId && String(order.assignedDriverId) === String(driver._id));
}

/** Claimed by a different driver — hide from pool. */
export function isReadyOrderClaimedByOther(order: IOrder, driver: IUser) {
  if (!order.claimedAt || !order.assignedDriverId) return false;
  return String(order.assignedDriverId) !== String(driver._id);
}

/** READY orders for pharmacies within 50 km of the driver's current location. */
export function canDriverSeeReadyOrder(
  order: IOrder,
  driver: IUser,
  pharmacy: IPharmacy,
  driverLat: number,
  driverLng: number,
  radiusKm = env.PHARMACY_NEARBY_RADIUS_KM,
): boolean {
  if (!driverApproved(driver)) return false;
  if (order.status !== OrderStatus.READY) return false;
  if (!pharmacy.active) return false;
  if (!pharmacyWithinPatientRadius(pharmacy, driverLat, driverLng, radiusKm)) return false;

  const mine = isOrderOwnedByDriver(order, driver);
  if (isReadyOrderClaimedByOther(order, driver)) return false;
  if (mine && order.claimedAt) return true;

  const mode = pharmacy.dispatchMode;
  if (mode === DispatchMode.ASSIGNED) {
    return mine;
  }
  if (order.claimedAt || (order.assignedDriverId && !mine)) return false;

  return true;
}

export function canDriverSeeOrderPreview(order: IOrder, driver: IUser, pharmacy: IPharmacy): boolean {
  if (!driverApproved(driver)) return false;

  const mine = isOrderOwnedByDriver(order, driver);
  if (isReadyOrderClaimedByOther(order, driver)) return false;

  const linked = pharmacy.linkedDriverIds.some((id) => String(id) === String(driver._id));
  if (!linked && pharmacy.dispatchMode === DispatchMode.ASSIGNED) {
    return mine;
  }

  if (order.status !== OrderStatus.READY && order.status !== OrderStatus.ON_THE_WAY) {
    return false;
  }

  const deliveryLat = order.deliveryCoordinates.latitude;
  const deliveryLng = order.deliveryCoordinates.longitude;
  if (!driverInZone(driver.serviceZones, deliveryLat, deliveryLng)) return false;

  const mode = pharmacy.dispatchMode;
  const isClaimed = order.claimedAt && mine;

  if (isClaimed || mine) return true;

  if (mode === DispatchMode.ASSIGNED) {
    return false;
  }
  if (mode === DispatchMode.OPEN_POOL) {
    return !order.claimedAt && !order.assignedDriverId;
  }
  // HYBRID
  return !order.claimedAt && !order.assignedDriverId;
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
