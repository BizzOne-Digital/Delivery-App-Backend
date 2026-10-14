import mongoose from "mongoose";
import { Order, type IOrder } from "../models/Order.js";
import type { AuthUser } from "../middleware/auth.js";
import { UserRole } from "../types/enums.js";
import { Customer } from "../models/Customer.js";

/** Resolve Mongo id or reference number (e.g. JD-…) from route params. */
export async function findOrderByIdOrReference(idParam: string): Promise<IOrder | null> {
  const raw = idParam.trim();
  if (!raw) return null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const byId = await Order.findById(raw);
    if (byId) return byId;
  }
  return Order.findOne({ referenceNumber: raw });
}

export async function buildOrderListFilter(auth: AuthUser): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  switch (auth.role) {
    case UserRole.PHARMACY_ADMIN:
    case UserRole.PHARMACY_STAFF:
      if (!auth.pharmacyId) {
        return { _id: null };
      }
      filter.pharmacyId = auth.pharmacyId;
      break;
    case UserRole.PATIENT: {
      const customers = await Customer.find({ userId: auth.id });
      const ids = customers.map((c) => c._id);
      filter.customerId = ids.length ? { $in: ids } : { $in: [] };
      break;
    }
    case UserRole.DRIVER:
      filter.assignedDriverId = auth.id;
      break;
    default:
      if (auth.companyId) {
        filter.companyId = auth.companyId;
      }
      break;
  }

  return filter;
}

export async function canAccessOrder(auth: AuthUser, order: IOrder): Promise<boolean> {
  switch (auth.role) {
    case UserRole.PHARMACY_ADMIN:
    case UserRole.PHARMACY_STAFF:
      return Boolean(auth.pharmacyId && String(order.pharmacyId) === auth.pharmacyId);
    case UserRole.PATIENT: {
      const customers = await Customer.find({ userId: auth.id });
      return customers.some((c) => String(c._id) === String(order.customerId));
    }
    case UserRole.DRIVER:
      return String(order.assignedDriverId) === auth.id;
    default:
      if (auth.companyId) return String(order.companyId) === auth.companyId;
      return auth.role === UserRole.SUPER_ADMIN;
  }
}
