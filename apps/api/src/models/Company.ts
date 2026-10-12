import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    plan: { type: String, default: "trial" },
    settings: {
      currency: { type: String, default: "USD" },
      timezone: { type: String, default: "America/Chicago" },
      paymentGating: { type: String, enum: ["warn", "block"], default: "warn" },
      // Refunds above this need a second person to approve. 0 turns approval off. Default $1,000.
      refundApprovalThresholdCents: { type: Number, default: 100000 },
    },
  },
  { timestamps: true },
);

export const Company = model("Company", companySchema);
