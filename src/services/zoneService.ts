import { env } from "../config/env.js";
import { haversineKm } from "../utils/haversine.js";
import type { ServiceZone } from "../models/Pharmacy.js";

export function pharmacyDistanceKm(
  pharmacy: { latitude: number; longitude: number },
  lat: number,
  lng: number,
): number {
  return haversineKm(lat, lng, pharmacy.latitude, pharmacy.longitude);
}

/** Pharmacies within radius (default 50 km) of the patient location. */
export function pharmacyWithinPatientRadius(
  pharmacy: { latitude: number; longitude: number },
  lat: number,
  lng: number,
  radiusKm = env.PHARMACY_NEARBY_RADIUS_KM,
): boolean {
  return pharmacyDistanceKm(pharmacy, lat, lng) <= radiusKm;
}

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
