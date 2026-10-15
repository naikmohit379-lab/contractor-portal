import { z } from "zod";
import { UNITS } from "./estimates";

export const PO_STATUSES = ["draft", "sent", "confirmed", "scheduled", "delivered", "partially_delivered", "backordered", "cancelled"] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  delivered: "Delivered",
  partially_delivered: "Partially delivered",
  backordered: "Backordered",
  cancelled: "Cancelled",
};

export const PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "backordered", "cancelled"],
  confirmed: ["scheduled", "backordered", "cancelled"],
  scheduled: ["delivered", "partially_delivered", "backordered", "cancelled"],
  partially_delivered: ["delivered", "backordered", "cancelled"],
  backordered: ["scheduled", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
export const canTransitionPO = (from: POStatus, to: POStatus) => PO_TRANSITIONS[from].includes(to);

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier name").max(120),
  accountNumber: z.string().trim().max(60).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.union([z.string().trim().toLowerCase().email("Enter a valid email address"), z.literal("")]).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  branch: z.string().trim().max(120).optional(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export const catalogItemSchema = z.object({
  materialKey: z.string().trim().min(1).max(60),
  sku: z.string().trim().min(1, "Enter the SKU").max(60),
  name: z.string().trim().min(2).max(160),
  unitPriceCents: z.number().int().min(0),
});
export const catalogSchema = z.object({ items: z.array(catalogItemSchema).max(300) });

export const poLineSchema = z.object({
  key: z.string().trim().min(1).max(60),
  description: z.string().trim().min(2).max(200),
  unit: z.enum(UNITS),
  quantity: z.number().int().min(1).max(100_000),
  sku: z.string().trim().max(60).optional(),
  unitPriceCents: z.number().int().min(0).optional(),
});

const deliveryWindow = z.object({
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Enter a delivery date"),
  slot: z.enum(["morning", "midday", "afternoon", "anytime"]).default("morning"),
});

export const poCreateSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  lines: z.array(poLineSchema).max(100).optional(), // omitted = generate from the latest estimate
  deliveryWindow: deliveryWindow.optional(),
  dropInstructions: z.string().trim().max(500).optional(),
});

export const poUpdateSchema = z.object({
  lines: z.array(poLineSchema).max(100).optional(),
  deliveryWindow: deliveryWindow.optional(),
  dropInstructions: z.string().trim().max(500).optional(),
});

export const poStatusSchema = z.object({
  status: z.enum(PO_STATUSES),
  note: z.string().trim().max(500).optional(),
});

/** Public, link-based supplier confirmation: no account required. */
export const supplierConfirmSchema = z.object({
  action: z.enum(["confirm", "backorder"]),
  deliveryWindow: deliveryWindow.optional(),
  note: z.string().trim().max(500).optional(),
});

export interface SupplierDTO {
  id: string;
  name: string;
  accountNumber?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  branch?: string;
  catalog: { materialKey: string; sku: string; name: string; unitPriceCents: number }[];
}

export interface PurchaseOrderDTO {
  id: string;
  poNumber: string;
  jobId: string;
  supplierId: string;
  supplierName: string;
  status: POStatus;
  lines: { key: string; description: string; unit: string; quantity: number; sku?: string; unitPriceCents?: number }[];
  deliveryWindow?: { date: string; slot: string };
  dropInstructions?: string;
  supplierInvoice?: { invoiceNumber: string; totalCents: number; documentId: string; receivedAt: string; expectedTotalCents: number; varianceCents: number | null; variancePct: number | null };
  statusHistory: { from?: POStatus; to: POStatus; at: string; note?: string; by?: string }[];
  totalCents: number;
  createdAt: string;
}
