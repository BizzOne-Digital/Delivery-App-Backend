import { Router } from "express";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { UserRole } from "../types/enums.js";
import { getTodayShift } from "../services/driverShiftService.js";

const router = Router();

router.get("/me/shift-today", authenticate, requireRoles(UserRole.DRIVER), asyncHandler(async (req, res) => {
  const shift = await getTodayShift(req.auth!.id);
  sendSuccess(res, shift);
}));

export default router;
