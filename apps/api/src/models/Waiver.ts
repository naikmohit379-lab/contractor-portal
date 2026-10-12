import { Schema, model } from "mongoose";
import { WAIVER_STATUSES, WAIVER_TYPES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const waiverSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, ref: "PaymentMilestone", required: true, index: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    type: { type: String, enum: WAIVER_TYPES, required: true },
    status: { type: String, enum: WAIVER_STATUSES, default: "requested" },
    amountCents: { type: Number, required: true, min: 0 },
    throughDate: { type: Date, required: true },
    templateVersion: { type: Number, required: true },
    renderedText: { type: String, required: true }, // the exact wording shown to the signer, frozen at request time

    tokenHash: { type: String, index: { unique: true, sparse: true } },
    expiresAt: Date,
    requestedAt: { type: Date, default: Date.now },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    viewedAt: Date,

    signedAt: Date,
    signerName: String,
    signatureImage: String,
    signerIp: String,
    signerUserAgent: String,
    needsReview: [String],
    declineReason: String,

    documentHash: String,
    lockedAt: Date,
  },
  { timestamps: true },
);
waiverSchema.plugin(tenancyPlugin);
waiverSchema.index({ companyId: 1, milestoneId: 1, partyId: 1 });

// Executed waivers are evidence: once a signed waiver is loaded it can never be changed through save().
// A correction means a new waiver request, which leaves the original on record.
waiverSchema.post("init", function (doc) {
  doc.$locals.wasLocked = !!doc.lockedAt;
});
waiverSchema.pre("save", function (next) {
  if (this.$locals.wasLocked && this.modifiedPaths().length > 0) {
    return next(new Error("Signed waivers are immutable"));
  }
  next();
});

export const Waiver = model("Waiver", waiverSchema);
