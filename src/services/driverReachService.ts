import type { Types } from "mongoose";
import { env } from "../config/env.js";
import { OrderStatus } from "../types/enums.js";
import type { IOrder } from "../models/Order.js";
import type { IPharmacy } from "../models/Pharmacy.js";
import type { IUser } from "../models/User.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { pharmacyDistanceKm, pharmacyWithinPatientRadius } from "./zoneService.js";
import { canDriverSeeReadyOrder } from "./orderVisibility.js";

export function parseDriverCoordinates(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function pharmaciesInDriverReach(
  companyId: Types.ObjectId | undefined,
  lat: number,
  lng: number,
  radiusKm = env.PHARMACY_NEARBY_RADIUS_KM,
): Promise<IPharmacy[]> {
  const filter: Record<string, unknown> = { active: true };
  if (companyId) filter.companyId = companyId;

  const items = await Pharmacy.find(filter);
  return items
    .filter((p) => pharmacyWithinPatientRadius(p, lat, lng, radiusKm))
    .sort((a, b) => pharmacyDistanceKm(a, lat, lng) - pharmacyDistanceKm(b, lat, lng));
}

export function mapPharmacyForDriver(pharmacy: IPharmacy, lat: number, lng: number) {
  const doc = pharmacy.toObject ? pharmacy.toObject() : pharmacy;
  const distanceKm = Math.round(pharmacyDistanceKm(pharmacy, lat, lng) * 10) / 10;
  return { ...doc, distanceKm };
}

export function filterReadyOrdersForDriver(
  orders: IOrder[],
  driver: IUser,
  pharmacies: IPharmacy[],
  lat: number,
  lng: number,
): Map<string, IOrder[]> {
  const grouped = new Map<string, IOrder[]>();
  for (const order of orders) {
    if (order.status !== OrderStatus.READY) continue;
    const pharmacy = pharmacies.find((p) => String(p._id) === String(order.pharmacyId));
    if (!pharmacy || !canDriverSeeReadyOrder(order, driver, pharmacy, lat, lng)) continue;
    const key = String(order.pharmacyId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(order);
  }
  return grouped;
}
