import { Schema, model } from "mongoose";
import { tenancyPlugin } from "../core/tenancyPlugin";

// v1 simplification: the supplier's catalog (material key -> SKU and price) is embedded in the supplier.
const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    accountNumber: String,
    contactName: String,
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: String,
    branch: String,
    catalog: [{ _id: false, materialKey: String, sku: String, name: String, unitPriceCents: Number }],
  },
  { timestamps: true },
);
supplierSchema.plugin(tenancyPlugin);
supplierSchema.index({ companyId: 1, name: 1 });

export const Supplier = model("Supplier", supplierSchema);
