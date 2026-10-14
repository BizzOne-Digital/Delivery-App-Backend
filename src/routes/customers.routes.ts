import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { Customer } from "../models/Customer.js";
import { UserRole } from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const HOME_LABEL = "Home";

/** Linked customer profile for the logged-in patient */
router.get("/me", authenticate, requireRoles(UserRole.PATIENT), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ userId: req.auth!.id, active: true });
  if (!customer) return sendError(res, "Customer profile not found", 404);
  sendSuccess(res, customer);
}));

/** Save patient home location for nearby pharmacy search (50 km radius). */
router.patch("/me/location", authenticate, requireRoles(UserRole.PATIENT), asyncHandler(async (req, res) => {
  const schema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    addressLine: z.string().min(2).optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid location", 400);

  const customer = await Customer.findOne({ userId: req.auth!.id, active: true });
  if (!customer) return sendError(res, "Customer profile not found", 404);

  const { latitude, longitude, addressLine, city, postalCode } = parsed.data;
  let home = customer.addresses.find((a) => a.label === HOME_LABEL);
  if (!home) {
    home = {
      label: HOME_LABEL,
      line1: addressLine ?? "Home location",
      city: city ?? "",
      province: "",
      postalCode: postalCode ?? "",
      latitude,
      longitude,
    };
    customer.addresses.push(home);
  } else {
    home.latitude = latitude;
    home.longitude = longitude;
    if (addressLine) home.line1 = addressLine;
    if (city) home.city = city;
    if (postalCode) home.postalCode = postalCode;
  }

  const homeId = home._id ?? customer.addresses[customer.addresses.length - 1]?._id;
  if (homeId) customer.defaultAddressId = homeId;

  await customer.save();
  sendSuccess(res, customer);
}));

export default router;
