import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

// Double-entry postings. Each money movement writes a balanced group of lines (see ledgerLogic).
// Append-only: corrections are made with new, opposite postings, never by editing or deleting.
const ledgerSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, ref: "PaymentMilestone" },
    group: { type: String, required: true },
    kind: { type: String, enum: ["payment_received", "refund"], required: true },
    account: { type: String, enum: ["cash", "receivable"], required: true },
    direction: { type: String, enum: ["debit", "credit"], required: true },
    amountCents: { type: Number, required: true, min: 1 },
    memo: String,
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
ledgerSchema.plugin(tenancyPlugin);

const FORBIDDEN = ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete", "deleteOne", "deleteMany", "replaceOne"] as const;
for (const op of FORBIDDEN) {
  ledgerSchema.pre(op as any, function () {
    throw new Error("Ledger entries are append-only");
  });
}
ledgerSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error("Ledger entries are append-only"));
  next();
});

export const LedgerEntry = model("LedgerEntry", ledgerSchema);
