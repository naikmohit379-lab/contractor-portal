import { z } from "zod";

import { UNITS } from "./units";
export { UNITS };

export const lineItemSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
  description: z.string().trim().min(2, "Describe this line").max(200),
  category: z.string().trim().min(1).max(60),
  unit: z.enum(UNITS),
  quantity: z.number().min(0).max(1_000_000),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  taxable: z.boolean(),
  depreciationPct: z.number().min(0).max(100),
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

export const estimateSettingsSchema = z.object({
  overheadPct: z.number().min(0).max(50),
  profitPct: z.number().min(0).max(50),
  taxPct: z.number().min(0).max(30),
  deductibleCents: z.number().int().min(0),
});
export type EstimateSettingsInput = z.infer<typeof estimateSettingsSchema>;

export const estimateGenerateSchema = z.object({ measurementId: z.string().min(1) });

export const estimateSaveSchema = z.object({
  lineItems: z.array(lineItemSchema).max(200),
  settings: estimateSettingsSchema,
  note: z.string().trim().max(500).optional(),
});

export const VERSION_KINDS = ["original", "approved", "supplement"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export const newVersionSchema = z.object({
  kind: z.enum(["approved", "supplement"]),
  fromVersion: z.number().int().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});

export interface EstimateVersionDTO {
  versionNo: number;
  kind: VersionKind;
  lockedAt?: string;
  note?: string;
  lineItems: LineItemInput[];
  settings: EstimateSettingsInput;
  totals: {
    subtotalCents: number;
    overheadCents: number;
    profitCents: number;
    taxCents: number;
    rcvCents: number;
    depreciationCents: number;
    acvCents: number;
    netClaimCents: number;
  };
  createdAt: string;
}

export interface EstimateDTO {
  id: string;
  jobId: string;
  currentVersion: number;
  versions: EstimateVersionDTO[];
}

export interface EstimateExportJob {
  jobNumber: string;
  customerName: string;
  address: string;
}

export interface EstimateExportTotals {
  lineTotals: Record<string, number>;
  subtotalCents: number;
  overheadCents: number;
  profitCents: number;
  taxCents: number;
  rcvCents: number;
  depreciationCents: number;
  acvCents: number;
  deductibleCents: number;
  netClaimCents: number;
}

const csvCell = (value: string | number | boolean) => {
  let text = String(value);
  // Prevent spreadsheet formula execution for user-controlled text fields.
  if (typeof value === "string" && /^[\u0000-\u0020]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** A line-item handoff CSV; this is not an Xactimate-native ESX project file. */
export function estimateHandoffCsv(job: EstimateExportJob, version: EstimateVersionDTO, totals: EstimateExportTotals): string {
  const headers = ["record_type", "job_number", "customer", "property_address", "estimate_version", "version_type", "line_key", "category", "description", "quantity", "unit", "unit_price_usd", "taxable", "depreciation_percent", "line_total_usd", "overhead_usd", "profit_usd", "tax_usd", "replacement_cost_usd", "depreciation_usd", "actual_cash_value_usd", "deductible_usd", "net_claim_usd"];
  const money = (cents: number) => (cents / 100).toFixed(2);
  const context = [job.jobNumber, job.customerName, job.address, version.versionNo, version.kind];
  const lines = version.lineItems.map((item) => [
    "LINE", ...context, item.key, item.category, item.description, item.quantity, item.unit,
    money(item.unitPriceCents), item.taxable, item.depreciationPct, money(totals.lineTotals[item.key] ?? 0),
    "", "", "", "", "", "", "", "",
  ]);
  const summary = ["TOTAL", ...context, "", "", "", "", "", "", "", "", money(totals.subtotalCents), ...[
    totals.overheadCents, totals.profitCents, totals.taxCents, totals.rcvCents,
    totals.depreciationCents, totals.acvCents, version.settings.deductibleCents, totals.netClaimCents,
  ].map(money)];
  return [headers, ...lines, summary].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
