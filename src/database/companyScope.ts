import type { Types } from "mongoose";

/** Prefer companyId in filters — required for efficient sharded cluster queries. */
export function withCompanyScope(
  companyId: string | Types.ObjectId | undefined,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!companyId) return base;
  return { ...base, companyId };
}
