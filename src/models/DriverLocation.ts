import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDriverLocation extends Document {
  driverId: Types.ObjectId;
  orderId?: Types.ObjectId;
  shiftId?: Types.ObjectId;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  recordedAt: Date;
}

const locSchema = new Schema<IDriverLocation>(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderId: Schema.Types.ObjectId,
    shiftId: Schema.Types.ObjectId,
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    heading: Number,
    speed: Number,
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

locSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const DriverLocation = mongoose.model<IDriverLocation>("DriverLocation", locSchema);
