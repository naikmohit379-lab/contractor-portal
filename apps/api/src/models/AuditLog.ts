import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true }, // e.g. job.created, job.stage_changed
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: "at", updatedAt: false } },
);
auditSchema.plugin(tenancyPlugin);
auditSchema.index({ companyId: 1, entity: 1, entityId: 1, at: -1 });

export const AuditLog = model("AuditLog", auditSchema);
