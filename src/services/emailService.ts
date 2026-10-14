import nodemailer, { type Transporter } from "nodemailer";

type SendResult = { delivered: boolean };

let cachedTransporter: Transporter | null | undefined;

function smtpConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(user && pass);
}

function getTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) return cachedTransporter;
  if (!smtpConfigured()) {
    cachedTransporter = null;
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    (process.env.SMTP_SECURE !== "false" && port === 465);

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtpout.secureserver.net",
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
    ...(port === 587 ? { requireTLS: true } : {}),
  });

  return cachedTransporter;
}

function mailFrom(): string {
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim();
  const name = process.env.SMTP_FROM_NAME?.trim() || "Delivery App";
  return `"${name}" <${from}>`;
}

async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.info(`[email] SMTP not configured — logging only.\nTo: ${options.to}\n${options.text}`);
    return { delivered: false };
  }

  await transporter.sendMail({
    from: mailFrom(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  console.info(`[email] Sent to ${options.to}: ${options.subject}`);
  return { delivered: true };
}

export async function sendPharmacyLoginCredentialsEmail(
  to: string,
  pharmacyName: string,
  loginEmail: string,
  password: string,
): Promise<SendResult> {
  const subject = `Your pharmacy portal login — ${pharmacyName}`;
  const text = [
    "Hello,",
    "",
    `Your pharmacy partner application for "${pharmacyName}" has been approved.`,
    "",
    "Sign in to the pharmacy portal with:",
    `Email: ${loginEmail}`,
    `Password: ${password}`,
    "",
    "Please change your password after your first login.",
    "",
    "If you did not request this account, contact support.",
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>Your pharmacy partner application for <strong>${escapeHtml(pharmacyName)}</strong> has been approved.</p>
    <p><strong>Sign in to the pharmacy portal:</strong></p>
    <ul>
      <li>Email: <code>${escapeHtml(loginEmail)}</code></li>
      <li>Password: <code>${escapeHtml(password)}</code></li>
    </ul>
    <p>Please change your password after your first login.</p>
  `;

  return sendMail({ to, subject, text, html });
}

export async function sendDriverLoginCredentialsEmail(
  to: string,
  driverName: string,
  loginEmail: string,
  password: string,
): Promise<SendResult> {
  const subject = "Your driver portal login";
  const text = [
    "Hello,",
    "",
    `A driver account has been created for ${driverName}.`,
    "",
    "Sign in to the driver app with:",
    `Email: ${loginEmail}`,
    `Password: ${password}`,
    "",
    "Please change your password after your first login.",
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>A driver account has been created for <strong>${escapeHtml(driverName)}</strong>.</p>
    <p><strong>Sign in to the driver app:</strong></p>
    <ul>
      <li>Email: <code>${escapeHtml(loginEmail)}</code></li>
      <li>Password: <code>${escapeHtml(password)}</code></li>
    </ul>
    <p>Please change your password after your first login.</p>
  `;

  return sendMail({ to, subject, text, html });
}

export async function sendPasswordResetOtpEmail(to: string, code: string): Promise<SendResult> {
  const subject = "Your password reset code";
  const text = [
    "Hello,",
    "",
    "Use this one-time code to reset your password:",
    code,
    "",
    "This code expires in 15 minutes.",
    "If you did not request a reset, you can ignore this email.",
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>Use this one-time code to reset your password:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes.</p>
    <p>If you did not request a reset, you can ignore this email.</p>
  `;

  return sendMail({ to, subject, text, html });
}

export async function sendPharmacyApplicationRejectedEmail(
  to: string,
  pharmacyName: string,
  reason: string,
): Promise<SendResult> {
  const subject = `Pharmacy application update — ${pharmacyName}`;
  const text = [
    "Hello,",
    "",
    `Thank you for applying for a pharmacy partner account (${pharmacyName}).`,
    "",
    "We are unable to approve your application at this time.",
    "",
    `Reason: ${reason}`,
    "",
    "You may contact us if you have questions or would like to reapply with updated information.",
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>Thank you for applying for a pharmacy partner account (<strong>${escapeHtml(pharmacyName)}</strong>).</p>
    <p>We are unable to approve your application at this time.</p>
    <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
    <p>You may contact us if you have questions or would like to reapply with updated information.</p>
  `;

  return sendMail({ to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Verify SMTP credentials (optional health check / script). */
export async function verifySmtpConnection(): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  await transporter.verify();
  return true;
}
