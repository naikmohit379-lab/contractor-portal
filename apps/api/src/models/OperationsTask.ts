import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

const operationsTaskSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    details: { type: String, trim: true, maxlength: 1200 },
    status: { type: String, enum: ["open", "blocked", "done"], default: "open" },
    dueAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
operationsTaskSchema.plugin(tenancyPlugin);
operationsTaskSchema.index({ companyId: 1, status: 1, dueAt: 1 });

export const OperationsTask = model("OperationsTask", operationsTaskSchema);
