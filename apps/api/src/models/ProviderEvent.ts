import { Schema, model } from "mongoose";

// Every processed gateway event id is kept. The unique index is what makes webhook redelivery harmless.
// Not tenant-plugged: events arrive before any tenant context exists.
const providerEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: String,
    companyId: Schema.Types.ObjectId,
    paymentId: Schema.Types.ObjectId,
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
providerEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const ProviderEvent = model("ProviderEvent", providerEventSchema);
