/** Dev-friendly email stub — replace with SMTP/transactional provider in production. */
export async function sendPharmacyLoginCredentialsEmail(
  to: string,
  pharmacyName: string,
  loginEmail: string,
  password: string,
) {
  const body = [
    `Hello,`,
    ``,
    `Your pharmacy partner application for "${pharmacyName}" has been approved.`,
    ``,
    `Sign in to the Delivery App pharmacy portal with:`,
    `Email: ${loginEmail}`,
    `Password: ${password}`,
    ``,
    `Please change your password after your first login.`,
  ].join("\n");

  if (process.env.NODE_ENV !== "production") {
    console.info(`[email] To: ${to}\n${body}`);
    return;
  }
  console.info(`[email] Pharmacy credentials sent to ${to} (configure SMTP to deliver in production).`);
}
