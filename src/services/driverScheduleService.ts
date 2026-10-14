import { OrderStatus } from "../types/enums.js";
import type { IOrder } from "../models/Order.js";
import type { IPharmacy } from "../models/Pharmacy.js";
import type { IUser } from "../models/User.js";
import { env } from "../config/env.js";
import { pharmacyWithinPatientRadius } from "./zoneService.js";
import { isReadyOrderClaimedByOther, redactOrderForDriver } from "./orderVisibility.js";

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function orderPlannerDayKey(order: { deliveryDay?: string; deliveryDate: Date }): string {
  if (order.deliveryDay) return order.deliveryDay;
  const d = new Date(order.deliveryDate);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isPlannerEligibleOrder(order: {
  deliveryDay?: string;
  deliveryDayConfirmed?: boolean;
}): boolean {
  if (order.deliveryDayConfirmed) return true;
  if (order.deliveryDay) return true;
  return false;
}

export function getNextSevenDayKeys(from = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(from);
    date.setDate(from.getDate() + i);
    keys.push(localDayKey(date));
  }
  return keys;
}

export function tomorrowDayKey(from = new Date()): string {
  const t = new Date(from);
  t.setDate(t.getDate() + 1);
  return localDayKey(t);
}

export function isScheduledForTomorrow(order: IOrder, from = new Date()): boolean {
  if (!isPlannerEligibleOrder(order)) return false;
  return orderPlannerDayKey(order) === tomorrowDayKey(from);
}

export function isInRollingPlannerWeek(order: IOrder, from = new Date()): boolean {
  if (!isPlannerEligibleOrder(order)) return false;
  const key = orderPlannerDayKey(order);
  return getNextSevenDayKeys(from).includes(key);
}

export function isActiveScheduleStatus(status: string) {
  return status !== OrderStatus.CANCELLED && status !== OrderStatus.COMPLETED;
}

export function pharmacyInDriverReach(
  pharmacy: IPharmacy,
  driverLat: number,
  driverLng: number,
  radiusKm = env.PHARMACY_NEARBY_RADIUS_KM,
) {
  return pharmacy.active && pharmacyWithinPatientRadius(pharmacy, driverLat, driverLng, radiusKm);
}

/** Scheduled orders visible on Tomorrow / Week (not pool-hiding claimed-by-other). */
export function canDriverSeeScheduledOrder(
  order: IOrder,
  pharmacy: IPharmacy,
  driverLat: number,
  driverLng: number,
): boolean {
  if (!isActiveScheduleStatus(order.status)) return false;
  if (!pharmacyInDriverReach(pharmacy, driverLat, driverLng)) return false;
  if (!isPlannerEligibleOrder(order)) return false;
  return true;
}

/** Driver may claim today for orders scheduled tomorrow (one day early). */
export function isDriverEarlyClaimForTomorrow(order: IOrder, now = new Date()): boolean {
  return isScheduledForTomorrow(order, now);
}

export function serializeScheduledOrder(order: IOrder, driver: IUser) {
  const owned =
    Boolean(order.claimedAt) &&
    Boolean(order.assignedDriverId) &&
    String(order.assignedDriverId) === String(driver._id);
  return {
    ...redactOrderForDriver(order, driver, owned),
    deliveryDay: orderPlannerDayKey(order),
    claimable:
      order.status === OrderStatus.READY &&
      !isReadyOrderClaimedByOther(order, driver) &&
      !owned,
  };
}

export function buildPlannerDayLabels(from = new Date()) {
  const todayKey = localDayKey(from);
  return getNextSevenDayKeys(from).map((key) => {
    const parts = key.split("-").map((n) => Number(n));
    const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!, 12, 0, 0, 0);
    return {
      key,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: key === todayKey,
    };
  });
}
