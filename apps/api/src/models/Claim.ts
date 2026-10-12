import { Schema, model } from "mongoose";
import { CLAIM_STATUSES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const claimSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    carrier: { type: String, required: true, trim: true },
    policyNo: { type: String, required: true, trim: true },
    claimNo: { type: String, required: true, trim: true },
    dateOfLoss: { type: Date, required: true },
    adjuster: { name: String, phone: String, email: String },
    deductibleCents: { type: Number, default: 0 },
    status: { type: String, enum: CLAIM_STATUSES, default: "draft" },
    approvedAmountCents: Number,
    statusHistory: [
      { _id: false, from: String, to: String, at: { type: Date, default: Date.now }, note: String, by: Schema.Types.ObjectId },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
claimSchema.plugin(tenancyPlugin);
claimSchema.index({ companyId: 1, jobId: 1 }, { unique: true });
claimSchema.index({ companyId: 1, status: 1 });

export const Claim = model("Claim", claimSchema);
