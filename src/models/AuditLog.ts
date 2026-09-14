import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAuditLog extends Document {
  companyId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditSchema = new Schema<IAuditLog>(
  {
    companyId: Schema.Types.ObjectId,
    actorId: Schema.Types.ObjectId,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: Schema.Types.ObjectId,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ companyId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditSchema);
