import mongoose, { Schema, type Document, type Types } from "mongoose";
import { DispatchMode } from "../types/enums.js";

export interface ServiceZone {
  zoneId: string;
  name: string;
  polygon?: { lat: number; lng: number }[];
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

export interface IPharmacy extends Document {
  companyId: Types.ObjectId;
  name: string;
  code: string;
  logoUrl?: string;
  displayColor: string;
  secondaryColor?: string;
  email: string;
  phone: string;
  contactPerson?: string;
  billingContact?: string;
  address: string;
  latitude: number;
  longitude: number;
  openingHours?: string;
  deliveryStartTime?: string;
  pickupInstructions?: string;
  serviceZones: ServiceZone[];
  linkedDriverIds: Types.ObjectId[];
  dispatchMode: string;
  ratePlanId?: Types.ObjectId;
  proofRules: {
    requireSignature: boolean;
    requirePhoto: boolean;
    requireReceiverName: boolean;
    requireManifestConfirm: boolean;
  };
  notificationRules: Record<string, boolean>;
  active: boolean;
  archivedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pharmacySchema = new Schema<IPharmacy>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    logoUrl: String,
    displayColor: { type: String, required: true, default: "#3B82F6" },
    secondaryColor: String,
    email: { type: String, required: true },
    phone: { type: String, required: true },
    contactPerson: String,
    billingContact: String,
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    openingHours: String,
    deliveryStartTime: String,
    pickupInstructions: String,
    serviceZones: [
      {
        zoneId: String,
        name: String,
        polygon: [{ lat: Number, lng: Number }],
        centerLat: Number,
        centerLng: Number,
        radiusKm: Number,
      },
    ],
    linkedDriverIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    dispatchMode: {
      type: String,
      enum: Object.values(DispatchMode),
      default: DispatchMode.HYBRID,
    },
    ratePlanId: { type: Schema.Types.ObjectId, ref: "PharmacyRatePlan" },
    proofRules: {
      requireSignature: { type: Boolean, default: true },
      requirePhoto: { type: Boolean, default: true },
      requireReceiverName: { type: Boolean, default: true },
      requireManifestConfirm: { type: Boolean, default: false },
    },
    notificationRules: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    archivedAt: Date,
    createdBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);

pharmacySchema.index({ companyId: 1, code: 1 }, { unique: true });
pharmacySchema.index({ active: 1 });

export const Pharmacy = mongoose.model<IPharmacy>("Pharmacy", pharmacySchema);
