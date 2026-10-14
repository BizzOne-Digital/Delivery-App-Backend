import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPharmacyDriverMessage extends Document {
  pharmacyId: Types.ObjectId;
  driverUserId: Types.ObjectId;
  senderUserId: Types.ObjectId;
  senderRole: "DRIVER" | "PHARMACY";
  body: string;
  readByDriverAt?: Date;
  readByPharmacyAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPharmacyDriverMessage>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    driverUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["DRIVER", "PHARMACY"], required: true },
    body: { type: String, required: true, maxlength: 2000 },
    readByDriverAt: Date,
    readByPharmacyAt: Date,
  },
  { timestamps: true },
);

schema.index({ pharmacyId: 1, driverUserId: 1, createdAt: -1 });

export const PharmacyDriverMessage = mongoose.model<IPharmacyDriverMessage>(
  "PharmacyDriverMessage",
  schema,
);
