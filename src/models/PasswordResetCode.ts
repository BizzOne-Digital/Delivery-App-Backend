import mongoose, { Schema, type Document } from "mongoose";

export interface IPasswordResetCode extends Document {
  email: string;
  codeHash: string;
  expiresAt: Date;
  verifyAttempts: number;
  createdAt: Date;
}

const schema = new Schema<IPasswordResetCode>(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    verifyAttempts: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ email: 1 }, { unique: true });

export const PasswordResetCode = mongoose.model<IPasswordResetCode>("PasswordResetCode", schema);
