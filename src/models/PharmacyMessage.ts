import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPharmacyMessage extends Document {
  pharmacyId: Types.ObjectId;
  patientUserId: Types.ObjectId;
  orderId?: Types.ObjectId;
  senderUserId: Types.ObjectId;
  senderRole: "PATIENT" | "PHARMACY";
  body: string;
  readByPatientAt?: Date;
  readByPharmacyAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPharmacyMessage>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["PATIENT", "PHARMACY"], required: true },
    body: { type: String, required: true, maxlength: 2000 },
    readByPatientAt: Date,
    readByPharmacyAt: Date,
  },
  { timestamps: true },
);

schema.index({ pharmacyId: 1, patientUserId: 1, createdAt: -1 });

export const PharmacyMessage = mongoose.model<IPharmacyMessage>("PharmacyMessage", schema);
