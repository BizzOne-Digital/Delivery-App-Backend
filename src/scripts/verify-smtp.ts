import "dotenv/config";
import { verifySmtpConnection } from "../services/emailService.js";

async function main() {
  if (!process.env.SMTP_USER?.trim() || !process.env.SMTP_PASS?.trim()) {
    console.error("Set SMTP_USER and SMTP_PASS in backend/.env first.");
    process.exit(1);
  }
  try {
    const ok = await verifySmtpConnection();
    console.log(ok ? "SMTP connection OK." : "SMTP not configured.");
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error("SMTP verify failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
