import { Schema, model } from "mongoose";
import { JOB_STAGES, STAGE_LABELS } from "@roofdesk/shared";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    plan: { type: String, default: "trial" },
    settings: {
      // Legacy defaults must remain U.S.-safe. Registration opts new companies into India explicitly.
      country: { type: String, enum: ["IN", "US"], default: "US" },
      currency: { type: String, default: "USD" },
      locale: { type: String, enum: ["en-IN", "hi-IN", "en-US"], default: "en-US" },
      language: { type: String, enum: ["en", "hi"], default: "en" },
      timezone: { type: String, default: "America/Chicago" },
      measurementSystem: { type: String, enum: ["metric", "imperial"], default: "imperial" },
      paymentGating: { type: String, enum: ["warn", "block"], default: "warn" },
      // Refunds above this need a second person to approve. 0 turns approval off. Minor-unit threshold: 1,000 major units.
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
