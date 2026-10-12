import { Schema, model } from "mongoose";
import { PAYMENT_STATUSES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

// Only gateway tokens and ids are stored. Card and bank details never reach this system.
const paymentSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, ref: "PaymentMilestone", required: true, index: true },
    description: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 100 },
    currency: { type: String, default: "USD" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "requested" },
    payerName: { type: String, required: true },
    payerEmail: String,

    provider: String,
    providerSessionId: String,
    providerPaymentIntentId: { type: String, index: true, sparse: true },
    checkoutAttempts: { type: Number, default: 0 },

    // The payer's link secret: stored hashed, shown to the sender once.
    tokenHash: { type: String, index: { unique: true, sparse: true } },
    failureReason: String,
    refundedCents: { type: Number, default: 0 },
    disputed: { type: Boolean, default: false },
    flag: String, // e.g. "amount_mismatch": needs a human to look at it
    paidAt: Date,
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
paymentSchema.plugin(tenancyPlugin);

export const Payment = model("Payment", paymentSchema);
