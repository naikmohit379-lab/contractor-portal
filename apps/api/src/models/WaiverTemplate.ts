import { Schema, model } from "mongoose";
import { WAIVER_TYPES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

// Versioned per company and waiver type. Editing creates a new version that must be approved again.
const templateSchema = new Schema(
  {
    type: { type: String, enum: WAIVER_TYPES, required: true },
    state: { type: String, default: "*" }, // "*" = any state; statutory per-state forms plug in here
    version: { type: Number, required: true },
    body: { type: String, required: true },
    active: { type: Boolean, default: true },
    legalApproved: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
  },
  { timestamps: true },
);
templateSchema.plugin(tenancyPlugin);
templateSchema.index({ companyId: 1, type: 1, state: 1, version: -1 }, { unique: true });

export const WaiverTemplate = model("WaiverTemplate", templateSchema);
