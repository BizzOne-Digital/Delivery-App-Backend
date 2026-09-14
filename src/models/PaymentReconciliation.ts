import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPaymentReconciliation extends Document {
  companyId: Types.ObjectId;
  driverId: Types.ObjectId;
  orderId: Types.ObjectId;
  expectedAmount: number;
  submittedAmount: number;
  difference: number;
  driverNote?: string;
  financeStatus: string;
  locked: boolean;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const reconSchema = new Schema<IPaymentReconciliation>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    expectedAmount: Number,
    submittedAmount: Number,
    difference: Number,
    driverNote: String,
    financeStatus: { type: String, default: "PENDING" },
    locked: { type: Boolean, default: false },
    reviewedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);

export const PaymentReconciliation = mongoose.model<IPaymentReconciliation>(
  "PaymentReconciliation",
  reconSchema,
);
