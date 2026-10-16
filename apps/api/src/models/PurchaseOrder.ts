import { Schema, model } from "mongoose";
import { PO_STATUSES, UNITS } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

const purchaseOrderSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    poNumber: { type: String, required: true },
    status: { type: String, enum: PO_STATUSES, default: "draft" },
    lines: [
      {
        _id: false,
        key: String,
        description: String,
        unit: { type: String, enum: UNITS },
        quantity: Number,
        sku: String,
        unitPriceCents: Number,
      },
    ],
    deliveryWindow: { date: Date, slot: String },
    supplierInvoice: {
      invoiceNumber: String,
      totalCents: Number,
      documentId: { type: Schema.Types.ObjectId, ref: "Document" },
      receivedAt: Date,
      uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    dropInstructions: String,
    // The raw token is shown once to the sender; only its hash is stored.
    confirmTokenHash: { type: String, index: true, sparse: true },
    statusHistory: [{ _id: false, from: String, to: String, at: { type: Date, default: Date.now }, note: String, by: String }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
purchaseOrderSchema.plugin(tenancyPlugin);
purchaseOrderSchema.index({ companyId: 1, poNumber: 1 }, { unique: true });

export const PurchaseOrder = model("PurchaseOrder", purchaseOrderSchema);
