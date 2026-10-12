import { Schema, model } from "mongoose";
import { UNITS, VERSION_KINDS } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const lineItemSchema = new Schema(
  {
    key: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    unit: { type: String, enum: UNITS, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    taxable: { type: Boolean, default: true },
    depreciationPct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const versionSchema = new Schema(
  {
    versionNo: { type: Number, required: true },
    kind: { type: String, enum: VERSION_KINDS, default: "original" },
    lockedAt: Date, // locked versions are history: they can never be edited
    note: String,
    lineItems: [lineItemSchema],
    settings: {
      overheadPct: { type: Number, default: 10 },
      profitPct: { type: Number, default: 10 },
      taxPct: { type: Number, default: 0 },
      deductibleCents: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// One estimate per job; versions are embedded (original, carrier-approved, supplements).
const estimateSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    currentVersion: { type: Number, default: 1 },
    versions: [versionSchema],
  },
  { timestamps: true },
);
estimateSchema.plugin(tenancyPlugin);
estimateSchema.index({ companyId: 1, jobId: 1 }, { unique: true });

export const Estimate = model("Estimate", estimateSchema);
