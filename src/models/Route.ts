import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IRoute extends Document {
  driverId: Types.ObjectId;
  orderIds: Types.ObjectId[];
  orderedStops: number[];
  startingLocation: { latitude: number; longitude: number };
  endingLocation?: { latitude: number; longitude: number };
  plannedStartTime?: Date;
  totalDistance?: number;
  estimatedDuration?: number;
  optimized: boolean;
  optimizationProvider: string;
  active: boolean;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const routeSchema = new Schema<IRoute>(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    orderedStops: [Number],
    startingLocation: {
      latitude: Number,
      longitude: Number,
    },
    endingLocation: { latitude: Number, longitude: Number },
    plannedStartTime: Date,
    totalDistance: Number,
    estimatedDuration: Number,
    optimized: { type: Boolean, default: false },
    optimizationProvider: { type: String, default: "local-nearest-neighbour" },
    active: { type: Boolean, default: true },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

export const Route = mongoose.model<IRoute>("Route", routeSchema);
