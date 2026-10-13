import { Schema, model } from "mongoose";
import { ROLES } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // v1: an account belongs to exactly one company, so email is globally unique.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "estimator" },
    status: { type: String, enum: ["active", "invited", "disabled"], default: "active" },
    lastLoginAt: Date,
    // Which notification groups also go to email. Empty = defaults from the shared package.
    prefs: { emailGroups: { type: Schema.Types.Mixed, default: {} } },
  },
  { timestamps: true },
);
userSchema.plugin(tenancyPlugin);

export const User = model("User", userSchema);
