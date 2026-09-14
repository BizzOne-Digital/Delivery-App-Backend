import { DriverShift } from "../models/DriverShift.js";
import { Order } from "../models/Order.js";
import { OrderStatus } from "../types/enums.js";
import type { IUser } from "../models/User.js";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function ensureShiftStarted(driver: IUser) {
  const day = startOfDay();
  let shift = await DriverShift.findOne({ driverId: driver._id, scheduledDate: day });
  if (!shift) {
    shift = await DriverShift.create({
      driverId: driver._id,
      companyId: driver.companyId,
      scheduledDate: day,
      scheduledStart: "09:00",
      scheduledEnd: "17:00",
      status: "ACTIVE",
      actualStart: new Date(),
    });
    return shift;
  }
  if (!shift.actualStart) {
    shift.actualStart = new Date();
    shift.status = "ACTIVE";
    await shift.save();
  }
  return shift;
}

export async function maybeCloseShiftAfterDelivery(driver: IUser) {
  const active = await Order.countDocuments({
    assignedDriverId: driver._id,
    status: OrderStatus.ON_THE_WAY,
  });
  if (active > 0) return;

  const day = startOfDay();
  const shift = await DriverShift.findOne({ driverId: driver._id, scheduledDate: day });
  if (!shift || shift.actualEnd) return;

  const completedToday = await Order.countDocuments({
    assignedDriverId: driver._id,
    status: OrderStatus.COMPLETED,
    updatedAt: { $gte: day, $lte: endOfDay() },
  });

  if (completedToday > 0) {
    shift.actualEnd = new Date();
    shift.status = "COMPLETED";
    shift.completedOrderCount = completedToday;
    if (shift.actualStart) {
      shift.totalActiveMinutes = Math.round((shift.actualEnd.getTime() - shift.actualStart.getTime()) / 60000);
    }
    await shift.save();
  }
}

export async function getTodayShift(driverId: string) {
  return DriverShift.findOne({ driverId, scheduledDate: startOfDay() });
}
