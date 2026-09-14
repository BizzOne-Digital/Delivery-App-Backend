import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPharmacyRatePlan extends Document {
  pharmacyId: Types.ObjectId;
  name: string;
  currency: string;
  baseDeliveryFee: number;
  includedDistanceKm: number;
  perKmFee: number;
  urgentSurcharge: number;
  afterHoursSurcharge: number;
  returnFee: number;
  failedAttemptFee: number;
  waitTimeFreeMinutes: number;
  waitTimePerMinuteFee: number;
  zoneRates?: { zoneId: string; fee: number }[];
  driverPayoutRule?: { type: string; value: number };
  taxRate: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  active: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ratePlanSchema = new Schema<IPharmacyRatePlan>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    name: { type: String, required: true },
    currency: { type: String, default: "CAD" },
    baseDeliveryFee: { type: Number, default: 8 },
    includedDistanceKm: { type: Number, default: 5 },
    perKmFee: { type: Number, default: 1.25 },
    urgentSurcharge: { type: Number, default: 5 },
    afterHoursSurcharge: { type: Number, default: 4 },
    returnFee: { type: Number, default: 6 },
    failedAttemptFee: { type: Number, default: 3 },
    waitTimeFreeMinutes: { type: Number, default: 10 },
    waitTimePerMinuteFee: { type: Number, default: 0.5 },
    zoneRates: [{ zoneId: String, fee: Number }],
    driverPayoutRule: { type: { type: String }, value: Number },
    taxRate: { type: Number, default: 13 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: Date,
    active: { type: Boolean, default: true },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);

ratePlanSchema.index({ pharmacyId: 1, active: 1, effectiveFrom: -1 });

export const PharmacyRatePlan = mongoose.model<IPharmacyRatePlan>("PharmacyRatePlan", ratePlanSchema);
