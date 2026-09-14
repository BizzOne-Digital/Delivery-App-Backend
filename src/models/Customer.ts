import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface Address {
  _id?: Types.ObjectId;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  accessInstructions?: string;
}

export interface ICustomer extends Document {
  companyId: Types.ObjectId;
  pharmacyIds: Types.ObjectId[];
  userId?: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  preferredLanguage?: string;
  addresses: Address[];
  defaultAddressId?: Types.ObjectId;
  deliveryNotes?: string;
  accessInstructions?: string;
  tags: string[];
  authorizedRecipients: { name: string; relationship: string; phone?: string }[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    pharmacyIds: [{ type: Schema.Types.ObjectId, ref: "Pharmacy" }],
    userId: { type: Schema.Types.ObjectId, ref: "User", sparse: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, required: true },
    alternatePhone: String,
    email: String,
    preferredLanguage: String,
    addresses: [
      {
        label: String,
        line1: String,
        line2: String,
        city: String,
        province: String,
        postalCode: String,
        latitude: Number,
        longitude: Number,
        accessInstructions: String,
      },
    ],
    defaultAddressId: Schema.Types.ObjectId,
    deliveryNotes: String,
    accessInstructions: String,
    tags: [String],
    authorizedRecipients: [{ name: String, relationship: String, phone: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.index({ phone: 1, companyId: 1 });

export const Customer = mongoose.model<ICustomer>("Customer", customerSchema);
