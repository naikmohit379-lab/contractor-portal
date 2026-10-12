import { Schema, model } from "mongoose";
import { JOB_STAGES, JOB_TYPES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const jobSchema = new Schema(
  {
    jobNumber: { type: String, required: true },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },
    property: {
      line1: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, uppercase: true, trim: true },
      zip: { type: String, required: true, trim: true },
      country: { type: String, default: "US" },
    },
    type: { type: String, enum: JOB_TYPES, default: "insurance" },
    stage: { type: String, enum: JOB_STAGES, default: "lead" },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
jobSchema.plugin(tenancyPlugin);
jobSchema.index({ companyId: 1, stage: 1, updatedAt: -1 });
jobSchema.index({ companyId: 1, jobNumber: 1 }, { unique: true });

export const Job = model("Job", jobSchema);
