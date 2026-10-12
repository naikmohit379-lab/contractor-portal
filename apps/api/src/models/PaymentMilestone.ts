import { Schema, model } from "mongoose";
import { MILESTONE_TYPES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const milestoneSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: MILESTONE_TYPES, required: true },
    expectedAmountCents: { type: Number, required: true, min: 0 },
    dueDate: Date,
    requireWaivers: { type: Boolean, default: true },
    status: { type: String, enum: ["pending", "ready", "paid"], default: "pending" },
    // Set when someone released the payment with waivers still missing (gating mode "warn").
    overrideNote: String,
    readyAt: Date,
    readyBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
milestoneSchema.plugin(tenancyPlugin);

export const PaymentMilestone = model("PaymentMilestone", milestoneSchema);
