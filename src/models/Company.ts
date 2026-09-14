import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ICompany extends Document {
  name: string;
  code: string;
  active: boolean;
  settings: {
    claimWindowHoursBefore: number;
    driverScheduleVisibilityDays: number;
    gpsStaleThresholdMinutes: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    settings: {
      claimWindowHoursBefore: { type: Number, default: 24 },
      driverScheduleVisibilityDays: { type: Number, default: 7 },
      gpsStaleThresholdMinutes: { type: Number, default: 5 },
    },
  },
  { timestamps: true },
);

export const Company = mongoose.model<ICompany>("Company", companySchema);
export type CompanyId = Types.ObjectId;
