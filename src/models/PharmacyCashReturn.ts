import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPharmacyCashReturn extends Document {
  companyId: Types.ObjectId;
  driverId: Types.ObjectId;
  pharmacyId: Types.ObjectId;
  orderIds: Types.ObjectId[];
  totalAmount: number;
  returnedAt: Date;
  pharmacySignatureName: string;
  driverNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPharmacyCashReturn>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    totalAmount: { type: Number, required: true },
    returnedAt: { type: Date, required: true },
    pharmacySignatureName: { type: String, required: true },
    driverNote: String,
  },
  { timestamps: true },
);

export const PharmacyCashReturn = mongoose.model<IPharmacyCashReturn>("PharmacyCashReturn", schema);
