import mongoose, { Schema, type Document, type Types } from "mongoose";
import { DriverOnboardingStatus, DriverStatus, UserRole } from "../types/enums.js";

export interface ServiceZoneRef {
  zoneId: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: string;
  companyId?: Types.ObjectId;
  pharmacyId?: Types.ObjectId;
  assignedPharmacyIds: Types.ObjectId[];
  serviceZones: ServiceZoneRef[];
  active: boolean;
  emailVerified: boolean;
  lastLoginAt?: Date;
  notificationPreferences: Record<string, boolean>;
  expoPushTokens: string[];
  driverStatus?: string;
  onboardingStatus?: string;
  profilePhotoUrl?: string;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  licensePlate?: string;
  driverLicense?: { url: string; uploadedAt: Date };
  insurance?: { url: string; uploadedAt: Date };
  backgroundCheckStatus?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  weeklyAvailability?: { dayOfWeek: number; start: string; end: string }[];
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: String,
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(UserRole), required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", index: true },
    assignedPharmacyIds: [{ type: Schema.Types.ObjectId, ref: "Pharmacy" }],
    serviceZones: [
      {
        zoneId: String,
        name: String,
        centerLat: Number,
        centerLng: Number,
        radiusKm: Number,
      },
    ],
    active: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: Date,
    notificationPreferences: { type: Schema.Types.Mixed, default: {} },
    expoPushTokens: { type: [String], default: [] },
    driverStatus: { type: String, enum: Object.values(DriverStatus), default: DriverStatus.OFFLINE },
    onboardingStatus: {
      type: String,
      enum: Object.values(DriverOnboardingStatus),
      default: DriverOnboardingStatus.DRAFT,
    },
    profilePhotoUrl: String,
    vehicleType: String,
    vehicleMake: String,
    vehicleModel: String,
    vehicleColor: String,
    licensePlate: String,
    driverLicense: { url: String, uploadedAt: Date },
    insurance: { url: String, uploadedAt: Date },
    backgroundCheckStatus: String,
    approvedBy: Schema.Types.ObjectId,
    approvedAt: Date,
    rejectionReason: String,
    weeklyAvailability: [{ dayOfWeek: Number, start: String, end: String }],
    refreshTokenHash: { type: String, select: false },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, companyId: 1 });

export const User = mongoose.model<IUser>("User", userSchema);
