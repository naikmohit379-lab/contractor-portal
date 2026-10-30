import { Schema, model } from "mongoose";

// Tokens are stored only as hashes and are looked up before tenant context exists.
const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: Date,
  },
  { timestamps: true },
);

export const PasswordResetToken = model("PasswordResetToken", passwordResetTokenSchema);
