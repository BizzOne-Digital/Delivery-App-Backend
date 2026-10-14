import { Router } from "express";
import { Pharmacy, type IPharmacy } from "../models/Pharmacy.js";
import { authenticate } from "../middleware/auth.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { pharmacyDistanceKm, pharmacyWithinPatientRadius } from "../services/zoneService.js";
import { env } from "../config/env.js";
import { z } from "zod";
import { isValidHexColor } from "../utils/pharmacyColors.js";
import { UserRole } from "../types/enums.js";
import { requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const PHARMACY_PORTAL_ROLES = [UserRole.PHARMACY_ADMIN, UserRole.PHARMACY_STAFF];

function mapPharmacyWithDistance(pharmacy: IPharmacy, lat: number, lng: number) {
  const doc = pharmacy.toObject ? pharmacy.toObject() : pharmacy;
  const distanceKm = pharmacyDistanceKm(pharmacy, lat, lng);
  return { ...doc, distanceKm: Math.round(distanceKm * 10) / 10 };
}

router.get("/", authenticate, async (req, res) => {
  const { lat, lng, activeOnly } = req.query;
  const filter: Record<string, unknown> = {};
  if (req.auth!.companyId) filter.companyId = req.auth!.companyId;
  if (activeOnly === "true") filter.active = true;

  const radiusKm = env.PHARMACY_NEARBY_RADIUS_KM;

  if (req.auth!.role === UserRole.PATIENT || req.auth!.role === UserRole.DRIVER) {
    if (!lat || !lng) {
      return sendSuccess(res, { radiusKm, items: [] });
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return sendError(res, "Invalid coordinates", 400);
    }
    const driverFilter: Record<string, unknown> = { ...filter, active: true };
    if (req.auth!.role === UserRole.DRIVER && req.auth!.companyId) {
      driverFilter.companyId = req.auth!.companyId;
    }
    const items = await Pharmacy.find(driverFilter);
    const nearby = items
      .filter((p) => pharmacyWithinPatientRadius(p, latitude, longitude, radiusKm))
      .map((p) => mapPharmacyWithDistance(p, latitude, longitude))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return sendSuccess(res, { radiusKm, items: nearby });
  }

  let items = await Pharmacy.find(filter);
  if (lat && lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const withDist = items
        .filter((p) => p.active && pharmacyWithinPatientRadius(p, latitude, longitude, radiusKm))
        .map((p) => mapPharmacyWithDistance(p, latitude, longitude))
        .sort((a, b) => a.distanceKm - b.distanceKm);
      return sendSuccess(res, withDist);
    }
  }
  sendSuccess(res, items);
});

router.patch(
  "/me/location",
  authenticate,
  requireRoles(...PHARMACY_PORTAL_ROLES),
  asyncHandler(async (req, res) => {
    const pharmacyId = req.auth!.pharmacyId;
    if (!pharmacyId) return sendError(res, "Pharmacy not linked", 400);

    const schema = z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      address: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, "Invalid location", 400);

    const ph = await Pharmacy.findById(pharmacyId);
    if (!ph) return sendError(res, "Pharmacy not found", 404);

    ph.latitude = parsed.data.latitude;
    ph.longitude = parsed.data.longitude;
    if (parsed.data.address?.trim()) {
      ph.address = parsed.data.address.trim();
    }
    await ph.save();
    sendSuccess(res, ph);
  }),
);

router.get("/:id", authenticate, async (req, res) => {
  const ph = await Pharmacy.findById(req.params.id);
  if (!ph) return sendError(res, "Not found", 404);
  sendSuccess(res, ph);
});

router.patch(
  "/:id",
  authenticate,
  requireRoles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN, UserRole.PHARMACY_ADMIN),
  async (req, res) => {
    const schema = z.object({
      displayColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      dispatchMode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, "Invalid", 400);
    if (parsed.data.displayColor && !isValidHexColor(parsed.data.displayColor)) {
      return sendError(res, "Invalid display color", 400);
    }
    const existing = await Pharmacy.findById(req.params.id);
    if (!existing) return sendError(res, "Not found", 404);
    if (
      req.auth!.role === UserRole.PHARMACY_ADMIN &&
      req.auth!.pharmacyId &&
      String(existing._id) !== req.auth!.pharmacyId
    ) {
      return sendError(res, "Forbidden", 403);
    }
    if (req.auth!.companyId && String(existing.companyId) !== req.auth!.companyId) {
      return sendError(res, "Forbidden", 403);
    }
    const ph = await Pharmacy.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
    sendSuccess(res, ph);
  },
);

export default router;
