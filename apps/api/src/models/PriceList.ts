import { Schema, model } from "mongoose";
import { UNITS } from "@roofdesk/shared";
import { tenancyPlugin } from "../core/tenancyPlugin";

// Versioned: saving creates a new version and retires the old one, so you can see what prices an old estimate used.
const priceListSchema = new Schema(
  {
    version: { type: Number, required: true },
    active: { type: Boolean, default: true },
    items: [
      {
        _id: false,
        key: String,
        description: String,
        category: String,
        unit: { type: String, enum: UNITS },
        unitPriceCents: Number,
        taxable: Boolean,
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
priceListSchema.plugin(tenancyPlugin);
priceListSchema.index({ companyId: 1, version: -1 }, { unique: true });

export const PriceList = model("PriceList", priceListSchema);
