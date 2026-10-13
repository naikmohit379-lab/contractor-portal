import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    href: String,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.plugin(tenancyPlugin);
notificationSchema.index({ companyId: 1, userId: 1, createdAt: -1 });
// In-app notifications are disposable: keep 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = model("Notification", notificationSchema);
