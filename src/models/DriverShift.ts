import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDriverShift extends Document {
  driverId: Types.ObjectId;
  companyId: Types.ObjectId;
  scheduledDate: Date;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: Date;
  actualEnd?: Date;
  breakPeriods: { start: Date; end?: Date }[];
  status: string;
  totalActiveMinutes?: number;
  totalDistance?: number;
  completedOrderCount?: number;
  locationPermissionState?: string;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IDriverShift>(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    scheduledDate: { type: Date, required: true, index: true },
    scheduledStart: String,
    scheduledEnd: String,
    actualStart: Date,
    actualEnd: Date,
    breakPeriods: [{ start: Date, end: Date }],
    status: { type: String, default: "SCHEDULED" },
    totalActiveMinutes: Number,
    totalDistance: Number,
    completedOrderCount: Number,
    locationPermissionState: String,
  },
  { timestamps: true },
);

export const DriverShift = mongoose.model<IDriverShift>("DriverShift", shiftSchema);
