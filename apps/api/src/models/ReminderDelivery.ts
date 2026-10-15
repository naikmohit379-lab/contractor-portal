import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

const reminderDeliverySchema = new Schema({
  taskId: { type: Schema.Types.ObjectId, ref: "OperationsTask", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reminderDay: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
reminderDeliverySchema.plugin(tenancyPlugin);
reminderDeliverySchema.index({ companyId: 1, taskId: 1, userId: 1, reminderDay: 1 }, { unique: true });

export const ReminderDelivery = model("ReminderDelivery", reminderDeliverySchema);
