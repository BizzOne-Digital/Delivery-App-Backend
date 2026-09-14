import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: string;
  read: boolean;
  data?: Record<string, unknown>;
  createdAt: Date;
}

const notifSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: String,
    body: String,
    type: String,
    read: { type: Boolean, default: false },
    data: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Notification = mongoose.model<INotification>("Notification", notifSchema);
