import crypto from "crypto";

export function generateTemporaryPassword(length = 12): string {
  return crypto.randomBytes(16).toString("base64url").slice(0, length);
}

export function slugPharmacyCode(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  return base || "PHARMACY";
}
