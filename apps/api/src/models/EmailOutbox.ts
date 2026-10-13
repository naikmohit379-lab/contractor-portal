import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

// A record of every email we tried to send. Secure links (signing, payment, confirmation) are stripped from
// the stored text: those links are credentials and are kept hashed everywhere else.
const emailSchema = new Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    kind: { type: String, required: true },
    redactedText: String,
    status: { type: String, enum: ["sent", "failed"], required: true },
    error: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
emailSchema.plugin(tenancyPlugin);
emailSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const EmailOutbox = model("EmailOutbox", emailSchema);
