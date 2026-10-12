import { Schema, model } from "mongoose";
import { COMM_CHANNELS } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const communicationSchema = new Schema(
  {
    claimId: { type: Schema.Types.ObjectId, ref: "Claim", required: true, index: true },
    channel: { type: String, enum: COMM_CHANNELS, required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    body: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
communicationSchema.plugin(tenancyPlugin);

export const Communication = model("Communication", communicationSchema);
