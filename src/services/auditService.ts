import type { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";

export async function writeAudit(params: {
  companyId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
}) {
  await AuditLog.create(params);
}
