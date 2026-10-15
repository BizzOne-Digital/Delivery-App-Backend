import { Notification } from "../models/Notification.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyDriverMessage } from "../models/PharmacyDriverMessage.js";
import { PharmacyMessage } from "../models/PharmacyMessage.js";

/**
 * Compound indexes aligned with MongoDB shard keys (companyId / tenant scope).
 * Run on connect so queries stay targeted as data grows.
 */
export async function ensureScaleIndexes(): Promise<void> {
  await Promise.all([
    Order.collection.createIndex({ companyId: 1, status: 1, deliveryDate: -1 }),
    Order.collection.createIndex({ companyId: 1, pharmacyId: 1, status: 1 }),
    User.collection.createIndex({ companyId: 1, role: 1, active: 1 }),
    User.collection.createIndex({ email: 1 }, { unique: true }),
    Pharmacy.collection.createIndex({ companyId: 1, active: 1 }),
    Notification.collection.createIndex({ userId: 1, read: 1, createdAt: -1 }),
    PharmacyMessage.collection.createIndex({ pharmacyId: 1, createdAt: -1 }),
    PharmacyDriverMessage.collection.createIndex({ pharmacyId: 1, driverUserId: 1, createdAt: -1 }),
  ]);
}
