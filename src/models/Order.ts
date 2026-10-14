import mongoose, { Schema, type Document, type Types } from "mongoose";
import { OrderPriority, OrderStatus, OrderType, PaymentMethod } from "../types/enums.js";
import type { RateSnapshot } from "../utils/rateCalculator.js";

export interface IOrder extends Document {
  referenceNumber: string;
  companyId: Types.ObjectId;
  pharmacyId: Types.ObjectId;
  customerId: Types.ObjectId;
  orderType: string;
  status: string;
  assignedDriverId?: Types.ObjectId;
  claimedAt?: Date;
  pickedUpAt?: Date;
  deliveryDate: Date;
  /** Calendar day YYYY-MM-DD (pharmacy-selected); used for planner grouping */
  deliveryDay?: string;
  /** True after pharmacy confirms delivery day via PATCH /delivery-date */
  deliveryDayConfirmed?: boolean;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  priority: string;
  amountDue: number;
  amountCollected?: number;
  paymentMethod?: string;
  estimatedClientCharge?: number;
  finalClientCharge?: number;
  rateSnapshot?: RateSnapshot;
  orderNotes?: string;
  customerNotesSnapshot?: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupCoordinates: { latitude: number; longitude: number };
  deliveryCoordinates: { latitude: number; longitude: number };
  serviceZoneId?: string;
  manifestItems: { name: string; quantity: number }[];
  packageCount: number;
  recurringOrderId?: Types.ObjectId;
  proofRequirements?: Record<string, boolean>;
  proofOfDelivery?: Record<string, unknown>;
  failureDetails?: Record<string, unknown>;
  returnDetails?: Record<string, unknown>;
  cancellationDetails?: Record<string, unknown>;
  statusTimestamps: Partial<Record<string, Date>>;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    referenceNumber: { type: String, required: true, unique: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    orderType: { type: String, enum: Object.values(OrderType), default: OrderType.DELIVERY },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.ACTION_REQUIRED,
      index: true,
    },
    assignedDriverId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    claimedAt: Date,
    pickedUpAt: Date,
    deliveryDate: { type: Date, required: true, index: true },
    deliveryDay: { type: String, index: true },
    deliveryDayConfirmed: { type: Boolean, default: false },
    timeWindowStart: String,
    timeWindowEnd: String,
    priority: { type: String, enum: Object.values(OrderPriority), default: OrderPriority.NORMAL },
    amountDue: { type: Number, default: 0 },
    amountCollected: Number,
    paymentMethod: { type: String, enum: Object.values(PaymentMethod) },
    estimatedClientCharge: Number,
    finalClientCharge: Number,
    rateSnapshot: { type: Schema.Types.Mixed },
    orderNotes: String,
    customerNotesSnapshot: String,
    pickupAddress: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    pickupCoordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    deliveryCoordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    serviceZoneId: String,
    manifestItems: [{ name: String, quantity: Number }],
    packageCount: { type: Number, default: 1 },
    recurringOrderId: Schema.Types.ObjectId,
    proofRequirements: Schema.Types.Mixed,
    proofOfDelivery: Schema.Types.Mixed,
    failureDetails: Schema.Types.Mixed,
    returnDetails: Schema.Types.Mixed,
    cancellationDetails: Schema.Types.Mixed,
    statusTimestamps: { type: Schema.Types.Mixed, default: {} },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

orderSchema.index({ pharmacyId: 1, status: 1, deliveryDate: 1 });
orderSchema.index({ assignedDriverId: 1, status: 1 });

export const Order = mongoose.model<IOrder>("Order", orderSchema);
