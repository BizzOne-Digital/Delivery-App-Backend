import "dotenv/config";
import nodemailer from "nodemailer";
import { resolveSmtpSettings } from "../config/smtpConfig.js";
import { resetSmtpTransporterCache, verifySmtpConnection } from "../services/emailService.js";

function printFixHints(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("smtp_auth_disabled") || lower.includes("smtpclientauthentication is disabled")) {
    console.error(`
This mailbox is on Microsoft 365 (GoDaddy Email / Microsoft).
1) Sign in at https://admin.microsoft.com
2) Users → info@mlksdelivery.com → Mail → Manage email apps
3) Turn ON "Authenticated SMTP"
4) In backend/.env set:
   SMTP_PROVIDER=microsoft
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_PASS=<Microsoft app password if required>
`);
    return;
  }
  if (lower.includes("535") || lower.includes("authentication rejected")) {
    console.error(`
GoDaddy / SMTP login was rejected. Check:
1) SMTP_USER is the full email (e.g. info@mlksdelivery.com)
2) Use the mailbox password OR a GoDaddy / Microsoft "app password" (not your website login)
3) For classic GoDaddy Workspace email:
   SMTP_PROVIDER=godaddy
   SMTP_HOST=smtpout.secureserver.net
   SMTP_PORT=465
   SMTP_SECURE=true
4) Regenerate the app password in GoDaddy Email & Office Dashboard → Security
`);
  }
}

async function tryConfigured(): Promise<boolean> {
  resetSmtpTransporterCache();
  const smtp = resolveSmtpSettings();
  console.log(`Testing ${smtp.provider}: ${smtp.host}:${smtp.port} (secure=${smtp.secure})`);
  try {
    await verifySmtpConnection();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Configured profile failed:", msg);
    printFixHints(msg);
    return false;
  }
}

async function tryFallbackProfiles(user: string, pass: string): Promise<boolean> {
  const profiles = [
    { name: "godaddy-465", host: "smtpout.secureserver.net", port: 465, secure: true },
    { name: "godaddy-587", host: "smtpout.secureserver.net", port: 587, secure: false },
    { name: "m365-587", host: "smtp.office365.com", port: 587, secure: false },
  ];

  console.log("\nTrying alternate GoDaddy / Microsoft profiles…");
  for (const p of profiles) {
    const t = nodemailer.createTransport({
      host: p.host,
      port: p.port,
      secure: p.secure,
      auth: { user, pass },
      requireTLS: p.port === 587,
      connectionTimeout: 15_000,
    });
    try {
      await t.verify();
      console.log(`\nSUCCESS with profile: ${p.name}`);
      console.log(`Update .env:\nSMTP_HOST=${p.host}\nSMTP_PORT=${p.port}\nSMTP_SECURE=${p.secure}`);
      if (p.host.includes("office365")) {
        console.log("SMTP_PROVIDER=microsoft");
      } else {
        console.log("SMTP_PROVIDER=godaddy");
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ${p.name}: ${msg.split("\n")[0]}`);
    }
  }
  return false;
}

async function main() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    console.error("Set SMTP_USER and SMTP_PASS in backend/.env first.");
    process.exit(1);
  }

  if (await tryConfigured()) {
    console.log("SMTP connection OK — ready to send mail.");
    process.exit(0);
  }

  if (await tryFallbackProfiles(user, pass)) {
    process.exit(0);
  }

  console.error("\nNo SMTP profile worked. Client must fix mailbox password or enable SMTP in Microsoft 365.");
  process.exit(1);
}

void main();
