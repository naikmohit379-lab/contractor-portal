import { Schema, model } from "mongoose";
import { JOB_STAGES, STAGE_LABELS } from "@roofdesk/shared";

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
      stageLabels: {
        type: Map,
        of: { type: String, trim: true, maxlength: 40 },
        default: () => Object.fromEntries(JOB_STAGES.map((stage) => [stage, STAGE_LABELS[stage]])),
      },
    },
  },
  { timestamps: true },
);

export const Company = model("Company", companySchema);
