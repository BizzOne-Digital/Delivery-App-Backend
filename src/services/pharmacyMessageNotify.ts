import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";

async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
) {
  const unique = [...new Set(tokens.filter((t) => t.startsWith("ExponentPushToken")))];
  if (!unique.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(
        unique.map((to) => ({
          to,
          sound: "default",
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          priority: "high",
          channelId: "order-updates",
        })),
      ),
    });
  } catch (err) {
    console.error("Pharmacy message push failed:", err);
  }
}

export async function notifyPatientPharmacyReply(patientUserId: string, pharmacyName: string, preview: string) {
  const user = await User.findById(patientUserId);
  if (!user?.active) return;

  const title = `Message from ${pharmacyName}`;
  const body = preview.slice(0, 120);

  await Notification.create({
    userId: user._id,
    title,
    body,
    type: "PHARMACY_MESSAGE",
    data: { pharmacyName },
  });

  const tokens = user.expoPushTokens ?? [];
  if (tokens.length) {
    await sendExpoPush(tokens, { title, body, data: { type: "PHARMACY_MESSAGE" } });
  }
}
