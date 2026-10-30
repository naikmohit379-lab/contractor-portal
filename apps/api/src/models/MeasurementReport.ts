import { Schema, model } from "mongoose";
import { MEASUREMENT_STATUSES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const measurementSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    provider: { type: String, required: true },
    providerOrderId: String,
    providerJobId: String,
    idempotencyKey: String,
    status: { type: String, enum: MEASUREMENT_STATUSES, default: "ordered" },
    preliminary: { type: Boolean, default: false },
    reviewStatus: String,
    addressSnapshot: String,
    sourceNote: { type: String, maxlength: 300 },
    imageryDate: Date,
    facets: [{ _id: false, id: String, areaSqFt: Number, pitch: String }],
    linear: {
      ridge: { type: Number, default: 0 },
      hip: { type: Number, default: 0 },
      valley: { type: Number, default: 0 },
      eave: { type: Number, default: 0 },
      rake: { type: Number, default: 0 },
    },
    totals: { areaSqFt: Number, squares: Number, wastePct: Number },
    // Manual corrections are append-only so original provider values stay auditable.
    overrides: [
      { _id: false, field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed, reason: String, by: Schema.Types.ObjectId, at: Date },
    ],
    error: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
measurementSchema.plugin(tenancyPlugin);
measurementSchema.index(
  { companyId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

export const MeasurementReport = model("MeasurementReport", measurementSchema);
