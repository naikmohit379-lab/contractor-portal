import { Schema, model } from "mongoose";

// Not tenant-plugged: it is looked up by token hash before any tenant context exists.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true }, // every rotation of one login shares a family
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL cleanup
    revokedAt: Date,
  },
  { timestamps: true },
);

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
