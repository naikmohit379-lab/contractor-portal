import { Schema, model } from "mongoose";
import { REFUND_STATUSES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const refundSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    amountCents: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    status: { type: String, enum: REFUND_STATUSES, default: "pending_approval" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" }, // empty for refunds made directly at the gateway
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    providerRefundId: String,
    processedAt: Date,
    failureReason: String,
  },
  { timestamps: true },
);
refundSchema.plugin(tenancyPlugin);

export const Refund = model("Refund", refundSchema);
