import { z } from "zod";

export const DOC_SLOPES = ["front", "rear", "left", "right", "ridge", "interior", "other"] as const;
export const MARKER_KINDS = ["hail", "wind", "missing", "other"] as const;
export const MARKER_LABELS: Record<(typeof MARKER_KINDS)[number], string> = { hail: "Hail hit", wind: "Wind damage", missing: "Missing shingle", other: "Other" };

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const markerSchema = z.object({
  id: z.string().min(1).max(40),
  x: z.number().min(0).max(1), // position as a fraction of the picture, so it survives any display size
  y: z.number().min(0).max(1),
  kind: z.enum(MARKER_KINDS),
  note: z.string().trim().max(200).optional(),
});
export type Marker = z.infer<typeof markerSchema>;

export const documentUpdateSchema = z.object({
  caption: z.string().trim().max(300).optional(),
  slope: z.enum(DOC_SLOPES).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  includeInPacket: z.boolean().optional(),
  annotations: z.array(markerSchema).max(50).optional(),
});

export interface DocumentDTO {
  id: string;
  jobId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  kind: "photo" | "document";
  version: number;
  tags: string[];
  slope?: (typeof DOC_SLOPES)[number];
  caption?: string;
  includeInPacket: boolean;
  annotations: Marker[];
  createdAt: string;
}

export interface DocumentVersionDTO {
  version: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy?: string;
  createdAt: string;
  current: boolean;
}

export const priceItemSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
  description: z.string().trim().min(2, "Describe the item").max(200),
  category: z.string().trim().min(1).max(60),
  unit: z.enum(["SQ", "LF", "EA", "SF", "BDL", "ROLL", "PC"]),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  taxable: z.boolean(),
});
export const priceListSchema = z.object({
  items: z.array(priceItemSchema).min(1, "Add at least one item").max(300),
});

export interface PriceListDTO {
  version: number;
  isDefault: boolean;
  items: z.infer<typeof priceItemSchema>[];
  updatedAt?: string;
}
