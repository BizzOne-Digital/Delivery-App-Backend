import { Router } from "express";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { Customer } from "../models/Customer.js";
import { UserRole } from "../types/enums.js";

const router = Router();

/** Linked customer profile for the logged-in patient */
router.get("/me", authenticate, requireRoles(UserRole.PATIENT), async (req, res) => {
  const customer = await Customer.findOne({ userId: req.auth!.id, active: true });
  if (!customer) return sendError(res, "Customer profile not found", 404);
  sendSuccess(res, customer);
});

export default router;
