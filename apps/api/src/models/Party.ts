import { Schema, model } from "mongoose";
import { PARTY_TYPES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const partySchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    type: { type: String, enum: PARTY_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    contactName: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    contractAmountCents: { type: Number, default: 0 },
    requiresWaiver: { type: Boolean, default: true },
  },
  { timestamps: true },
);
partySchema.plugin(tenancyPlugin);

export const Party = model("Party", partySchema);
