import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { UserRole } from "../types/enums.js";

async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
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
    channelId: "order-updates",
  }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Admin push notify failed:", err);
  }
}

const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.DISPATCHER];

export async function notifyAdminsNewPharmacyApplication(
  applicationId: string,
  pharmacyName: string,
  applicantEmail: string,
) {
  const admins = await User.find({ role: { $in: ADMIN_ROLES }, active: true });
  const title = "New pharmacy application";
  const body = `${pharmacyName} (${applicantEmail}) submitted a partner application.`;

  for (const admin of admins) {
    await Notification.create({
      userId: admin._id,
      title,
      body,
      type: "PHARMACY_APPLICATION",
      data: { applicationId, pharmacyName },
    });

    const tokens = admin.expoPushTokens ?? [];
    if (tokens.length) {
      await sendExpoPush(tokens, {
        title,
        body,
        data: { applicationId, type: "PHARMACY_APPLICATION" },
      });
    }
  }
}
