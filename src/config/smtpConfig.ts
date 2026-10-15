export type SmtpResolved = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  provider: string;
};

/** GoDaddy Workspace vs Microsoft 365 (common on GoDaddy domains). */
export function resolveSmtpSettings(): SmtpResolved {
  const provider = (process.env.SMTP_PROVIDER ?? "godaddy").toLowerCase().trim();

  if (provider === "m365" || provider === "microsoft" || provider === "office365") {
    return {
      provider: "microsoft365",
      host: process.env.SMTP_HOST?.trim() || "smtp.office365.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTls: true,
    };
  }

  if (provider === "godaddy" || provider === "secureserver") {
    const port = Number(process.env.SMTP_PORT ?? 465);
    return {
      provider: "godaddy",
      host: process.env.SMTP_HOST?.trim() || "smtpout.secureserver.net",
      port,
      secure: process.env.SMTP_SECURE !== "false" && port === 465,
      requireTls: port === 587,
    };
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    provider: "custom",
    host: process.env.SMTP_HOST?.trim() || "smtpout.secureserver.net",
    port,
    secure: process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE !== "false" && port === 465),
    requireTls: port === 587,
  };
}
