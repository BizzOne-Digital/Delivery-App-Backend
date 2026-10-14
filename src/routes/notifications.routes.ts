import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { Notification } from "../models/Notification.js";
import { PharmacyDriverMessage } from "../models/PharmacyDriverMessage.js";
import { PharmacyMessage } from "../models/PharmacyMessage.js";
import { UserRole } from "../types/enums.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";

const router = Router();

router.get("/badge", authenticate, asyncHandler(async (req, res) => {
  const userId = req.auth!.id;
  const role = req.auth!.role;

  const unreadNotifications = await Notification.countDocuments({ userId, read: false });

  let unreadMessages = 0;
  if (role === UserRole.DRIVER) {
    unreadMessages = await PharmacyDriverMessage.countDocuments({
      driverUserId: userId,
      senderRole: "PHARMACY",
      readByDriverAt: { $exists: false },
    });
  } else if (role === UserRole.PATIENT) {
    unreadMessages = await PharmacyMessage.countDocuments({
      patientUserId: userId,
      senderRole: "PHARMACY",
      readByPatientAt: { $exists: false },
    });
  } else if (role === UserRole.PHARMACY_ADMIN || role === UserRole.PHARMACY_STAFF) {
    const pharmacyId = req.auth!.pharmacyId;
    if (pharmacyId) {
      const [patient, driver] = await Promise.all([
        PharmacyMessage.countDocuments({
          pharmacyId,
          senderRole: "PATIENT",
          readByPharmacyAt: { $exists: false },
        }),
        PharmacyDriverMessage.countDocuments({
          pharmacyId,
          senderRole: "DRIVER",
          readByPharmacyAt: { $exists: false },
        }),
      ]);
      unreadMessages = patient + driver;
    }
  }

  const unreadOrderAlerts =
    role === UserRole.DRIVER
      ? await Notification.countDocuments({ userId, read: false, type: "DRIVER_NEW_ORDER" })
      : 0;

  sendSuccess(res, {
    unreadNotifications,
    unreadMessages,
    unreadOrderAlerts,
    total: unreadNotifications + unreadMessages,
  });
}));

router.get("/", authenticate, asyncHandler(async (req, res) => {
  const items = await Notification.find({ userId: req.auth!.id })
    .sort({ createdAt: -1 })
    .limit(50);
  sendSuccess(res, items);
}));

router.patch("/read-all", authenticate, asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.auth!.id, read: false }, { $set: { read: true } });
  sendSuccess(res, { ok: true });
}));

export default router;
