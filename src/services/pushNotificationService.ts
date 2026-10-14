import { Notification } from "../models/Notification.js";
import { Customer } from "../models/Customer.js";
import { User } from "../models/User.js";
import type { IOrder } from "../models/Order.js";
import { OrderStatus, UserRole } from "../types/enums.js";

const PHARMACY_STAFF_ROLES = [UserRole.PHARMACY_ADMIN, UserRole.PHARMACY_STAFF];

const STATUS_LABELS: Record<string, string> = {
  ACTION_REQUIRED: "Action required",
  PREPARING: "Preparing",
  READY: "Ready for delivery",
  ON_THE_WAY: "On the way",
  RETURNING: "Returning",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string>; channelId?: string },
) {
  const unique = [...new Set(tokens.filter((t) => t.startsWith("ExponentPushToken")))];
  if (!unique.length) return;

  const messages = unique.map((to) => ({
    to,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    priority: "high",
    channelId: message.channelId ?? "order-updates",
  }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Expo push send failed:", err);
  }
}

/** Notify linked patient when order status changes. */
export async function notifyPatientOrderStatusChange(
  order: IOrder,
  previousStatus: string,
) {
  if (previousStatus && order.status === previousStatus) return;

  const customer = await Customer.findById(order.customerId);
  if (!customer?.userId) return;

  const user = await User.findById(customer.userId);
  if (!user?.active || user.role !== UserRole.PATIENT) return;

  const prefs = user.notificationPreferences ?? {};
  if (prefs.orderUpdates === false) return;

  const tokens: string[] = Array.isArray(user.expoPushTokens)
    ? user.expoPushTokens.filter(Boolean)
    : [];
  if (!tokens.length) return;

  const title = "Order update";
  const body = `${order.referenceNumber} is now ${statusLabel(order.status)}`;

  await Notification.create({
    userId: user._id,
    title,
    body,
    type: "ORDER_STATUS",
    data: { orderId: String(order._id), status: order.status },
  });

  await sendExpoPush(tokens, {
    title,
    body,
    data: { orderId: String(order._id), status: order.status },
  });
}

async function notifyPharmacyStaff(
  pharmacyId: unknown,
  opts: {
    prefKey: "dispatchAlerts" | "orderUpdates" | "patientMessages" | "driverMessages";
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  },
) {
  const staff = await User.find({
    pharmacyId,
    role: { $in: PHARMACY_STAFF_ROLES },
    active: true,
  });
  if (!staff.length) return;

  for (const user of staff) {
    const prefs = user.notificationPreferences ?? {};
    if (prefs[opts.prefKey] === false) continue;

    await Notification.create({
      userId: user._id,
      title: opts.title,
      body: opts.body,
      type: opts.type,
      data: opts.data,
    });

    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens.filter(Boolean) : [];
    if (tokens.length) {
      await sendExpoPush(tokens, {
        title: opts.title,
        body: opts.body,
        data: opts.data,
        channelId:
          opts.type === "PHARMACY_MESSAGE" || opts.type === "DRIVER_PHARMACY_MESSAGE"
            ? "messages"
            : "order-updates",
      });
    }
  }
}

/** New order for this pharmacy (patient or admin-created; not self-created by pharmacy staff). */
export async function notifyPharmacyNewOrder(order: IOrder, createdByRole?: string) {
  if (
    createdByRole === UserRole.PHARMACY_ADMIN ||
    createdByRole === UserRole.PHARMACY_STAFF
  ) {
    return;
  }

  const title = "New order";
  const body = `${order.referenceNumber} needs your attention`;

  await notifyPharmacyStaff(order.pharmacyId, {
    prefKey: "dispatchAlerts",
    title,
    body,
    type: "PHARMACY_NEW_ORDER",
    data: { orderId: String(order._id), status: order.status },
  });
}

const PHARMACY_STATUS_ALERTS = new Set<string>([
  OrderStatus.RETURNING,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
]);

/** Pharmacy alert when driver/system moves order to returning, completed, or cancelled. */
export async function notifyPharmacyOrderStatusChange(
  order: IOrder,
  previousStatus: string,
) {
  if (order.status === previousStatus) return;
  if (!PHARMACY_STATUS_ALERTS.has(order.status)) return;

  const title = "Order update";
  const body = `${order.referenceNumber} is now ${statusLabel(order.status)}`;

  await notifyPharmacyStaff(order.pharmacyId, {
    prefKey: "orderUpdates",
    title,
    body,
    type: "PHARMACY_ORDER_STATUS",
    data: { orderId: String(order._id), status: order.status },
  });
}

/** Pharmacy push when a patient sends a chat message. */
export async function notifyPharmacyStaffPatientMessage(
  pharmacyId: unknown,
  patientUserId: string,
  patientName: string,
  preview: string,
) {
  const title = "New patient message";
  const body = `${patientName}: ${preview.slice(0, 120)}`;

  await notifyPharmacyStaff(pharmacyId, {
    prefKey: "patientMessages",
    title,
    body,
    type: "PHARMACY_MESSAGE",
    data: {
      type: "PHARMACY_MESSAGE",
      patientUserId,
      pharmacyId: String(pharmacyId),
    },
  });
}

/** Pharmacy push when a driver sends a chat message. */
export async function notifyPharmacyStaffDriverMessage(
  pharmacyId: unknown,
  driverUserId: string,
  driverName: string,
  preview: string,
) {
  const title = "New driver message";
  const body = `${driverName}: ${preview.slice(0, 120)}`;

  await notifyPharmacyStaff(pharmacyId, {
    prefKey: "driverMessages",
    title,
    body,
    type: "DRIVER_PHARMACY_MESSAGE",
    data: {
      type: "DRIVER_PHARMACY_MESSAGE",
      driverUserId,
      pharmacyId: String(pharmacyId),
    },
  });
}

/** Driver push when pharmacy sends a chat reply. */
export async function notifyDriverPharmacyMessage(
  driverUserId: string,
  pharmacyId: string,
  pharmacyName: string,
  preview: string,
) {
  const user = await User.findById(driverUserId);
  if (!user?.active || user.role !== UserRole.DRIVER) return;

  const prefs = user.notificationPreferences ?? {};
  if (prefs.pharmacyMessages === false) return;

  const title = `Message from ${pharmacyName}`;
  const body = preview.slice(0, 120);

  await Notification.create({
    userId: user._id,
    title,
    body,
    type: "DRIVER_PHARMACY_MESSAGE",
    data: { pharmacyId, pharmacyName },
  });

  const tokens: string[] = Array.isArray(user.expoPushTokens)
    ? user.expoPushTokens.filter(Boolean)
    : [];
  if (!tokens.length) return;

  await sendExpoPush(tokens, {
    title,
    body,
    data: {
      type: "DRIVER_PHARMACY_MESSAGE",
      pharmacyId,
      pharmacyName,
    },
    channelId: "messages",
  });
}

/** Patient push when pharmacy sends a chat reply. */
export async function notifyPatientPharmacyMessage(
  patientUserId: string,
  pharmacyId: string,
  pharmacyName: string,
  preview: string,
) {
  const user = await User.findById(patientUserId);
  if (!user?.active || user.role !== UserRole.PATIENT) return;

  const prefs = user.notificationPreferences ?? {};
  if (prefs.pharmacyMessages === false) return;

  const title = `Message from ${pharmacyName}`;
  const body = preview.slice(0, 120);

  await Notification.create({
    userId: user._id,
    title,
    body,
    type: "PHARMACY_MESSAGE",
    data: { pharmacyId, pharmacyName },
  });

  const tokens: string[] = Array.isArray(user.expoPushTokens)
    ? user.expoPushTokens.filter(Boolean)
    : [];
  if (!tokens.length) return;

  await sendExpoPush(tokens, {
    title,
    body,
    data: {
      type: "PHARMACY_MESSAGE",
      pharmacyId,
      pharmacyName,
    },
    channelId: "messages",
  });
}
