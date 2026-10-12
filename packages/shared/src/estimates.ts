import { z } from "zod";

export const UNITS = ["SQ", "LF", "EA", "SF", "BDL", "ROLL", "PC"] as const;

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
