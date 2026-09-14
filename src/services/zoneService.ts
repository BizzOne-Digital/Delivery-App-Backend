import { haversineKm } from "../utils/haversine.js";
import type { ServiceZone } from "../models/Pharmacy.js";

export function pointInServiceZone(lat: number, lng: number, zone: ServiceZone): boolean {
  const dist = haversineKm(lat, lng, zone.centerLat, zone.centerLng);
  return dist <= zone.radiusKm;
}

export function pharmacyServesLocation(pharmacy: { serviceZones: ServiceZone[] }, lat: number, lng: number): boolean {
  if (!pharmacy.serviceZones?.length) return false;
  return pharmacy.serviceZones.some((z) => pointInServiceZone(lat, lng, z));
}

export function driverInZone(
  driverZones: { centerLat: number; centerLng: number; radiusKm: number }[],
  lat: number,
  lng: number,
): boolean {
  return driverZones.some((z) => haversineKm(lat, lng, z.centerLat, z.centerLng) <= z.radiusKm);
}
