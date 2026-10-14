import { env } from "../config/env.js";
import { haversineKm } from "../utils/haversine.js";
import type { ServiceZone } from "../models/Pharmacy.js";

const PLACEHOLDER_TORONTO_LAT = 43.6532;
const PLACEHOLDER_TORONTO_LNG = -79.3832;

/** Pharmacies still on the default approval pin are hidden until GPS is saved. */
export function pharmacyLocationReadyForNearby(
  pharmacy: { latitude: number; longitude: number; locationConfirmedAt?: Date | null },
): boolean {
  if (pharmacy.locationConfirmedAt) return true;
  const lat = pharmacy.latitude;
  const lng = pharmacy.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  const isPlaceholder =
    Math.abs(lat - PLACEHOLDER_TORONTO_LAT) < 0.0002 &&
    Math.abs(lng - PLACEHOLDER_TORONTO_LNG) < 0.0002;
  return !isPlaceholder;
}

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
  if (!pharmacyLocationReadyForNearby(pharmacy)) return false;
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
