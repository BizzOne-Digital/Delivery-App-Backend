import { Router } from "express";
import { Pharmacy } from "../models/Pharmacy.js";
import { authenticate } from "../middleware/auth.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { pharmacyServesLocation } from "../services/zoneService.js";
import { z } from "zod";
import { isValidHexColor } from "../utils/pharmacyColors.js";
import { UserRole } from "../types/enums.js";
import { requireRoles } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, async (req, res) => {
  const { lat, lng, activeOnly } = req.query;
  const filter: Record<string, unknown> = {};
  if (req.auth!.companyId) filter.companyId = req.auth!.companyId;
  if (activeOnly === "true") filter.active = true;

  if (req.auth!.role === UserRole.PATIENT) {
    if (!lat || !lng) {
      return sendSuccess(res, []);
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    const items = await Pharmacy.find({ ...filter, active: true });
    return sendSuccess(
      res,
      items.filter((p) => pharmacyServesLocation(p, latitude, longitude)),
    );
  }

  let items = await Pharmacy.find(filter);
  if (lat && lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    items = items.filter((p) => p.active && pharmacyServesLocation(p, latitude, longitude));
  }
  sendSuccess(res, items);
});

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
