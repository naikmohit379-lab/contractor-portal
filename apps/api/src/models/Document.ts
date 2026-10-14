import { Schema, model } from "mongoose";
import { DOC_SLOPES, MARKER_KINDS } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

// The database holds details; the file itself lives in storage under storageKey.
const documentSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    kind: { type: String, enum: ["photo", "document"], required: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true }, // detected from the file's bytes, not taken from the browser
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true }, // proves the stored file is the one that was uploaded
    storageKey: { type: String, required: true },
    slope: { type: String, enum: DOC_SLOPES },
    caption: String,
    includeInPacket: { type: Boolean, default: true },
    annotations: [{ _id: false, id: String, x: Number, y: Number, kind: { type: String, enum: MARKER_KINDS }, note: String }],
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
documentSchema.plugin(tenancyPlugin);

export const Document = model("Document", documentSchema);
