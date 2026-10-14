import mongoose, { Schema, type Document, type Types } from "mongoose";
import { PharmacyApplicationStatus } from "../types/enums.js";

export interface IPharmacyApplication extends Document {
  companyId?: Types.ObjectId;
  status: string;
  yourCompanyName?: string;
  clientCompanyName?: string;
  clientPostalAddress?: string;
  pickupAddress?: string;
  mobilusBillingAuthorized?: boolean;
  pharmacyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  province?: string;
  postalCode?: string;
  licenseNumber?: string;
  notes?: string;
  rejectionReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  approvedPharmacyId?: Types.ObjectId;
  approvedUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPharmacyApplication>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    status: {
      type: String,
      enum: Object.values(PharmacyApplicationStatus),
      default: PharmacyApplicationStatus.PENDING,
      index: true,
    },
    yourCompanyName: String,
    clientCompanyName: String,
    clientPostalAddress: String,
    pickupAddress: String,
    mobilusBillingAuthorized: Boolean,
    pharmacyName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: String,
    province: String,
    postalCode: String,
    licenseNumber: String,
    notes: String,
    rejectionReason: String,
    reviewedBy: Schema.Types.ObjectId,
    reviewedAt: Date,
    approvedPharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy" },
    approvedUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

schema.index({ email: 1, status: 1 });

export const PharmacyApplication = mongoose.model<IPharmacyApplication>(
  "PharmacyApplication",
  schema,
);
