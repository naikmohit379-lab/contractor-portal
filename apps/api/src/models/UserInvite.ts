import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

const userInviteSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["operations", "pm"], default: "operations" },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
userInviteSchema.plugin(tenancyPlugin);
userInviteSchema.index({ companyId: 1, email: 1, acceptedAt: 1 });

export const UserInvite = model("UserInvite", userInviteSchema);
