import { Schema, model } from "mongoose";
import { JOB_STAGES, JOB_TYPES, LEGACY_JOB_TYPES } from "@roofdesk/shared";
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
      line2: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      locality: { type: String, trim: true },
      district: { type: String, trim: true },
      state: { type: String, required: true, trim: true },
      zip: { type: String, trim: true },
      pinCode: { type: String, trim: true, validate: { validator: (v: string | undefined) => !v || /^[1-9][0-9]{5}$/.test(v), message: "PIN code must contain 6 digits" } },
      landmark: { type: String, trim: true },
      coordinates: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
      country: { type: String, default: "US" },
    },
    type: { type: String, enum: [...JOB_TYPES, ...LEGACY_JOB_TYPES], default: "residential" },
    stage: { type: String, enum: JOB_STAGES, default: "lead" },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
jobSchema.pre("validate", function () {
  if (this.property?.country === "IN") {
    if (!this.property.district) this.invalidate("property.district", "District is required for Indian addresses");
    if (!this.property.pinCode || !/^[1-9][0-9]{5}$/.test(this.property.pinCode)) this.invalidate("property.pinCode", "Enter a valid 6-digit PIN code");
  } else {
    if (!this.property?.zip || this.property.zip.length < 5) this.invalidate("property.zip", "ZIP code is required for U.S. addresses");
  }
});
jobSchema.plugin(tenancyPlugin);
jobSchema.index({ companyId: 1, stage: 1, updatedAt: -1 });
jobSchema.index({ companyId: 1, jobNumber: 1 }, { unique: true });

export const Job = model("Job", jobSchema);
