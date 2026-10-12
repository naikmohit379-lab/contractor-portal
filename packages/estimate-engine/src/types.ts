export type Unit = "SQ" | "LF" | "EA" | "SF" | "BDL" | "ROLL" | "PC";

/** All money is integer cents. Quantities may be fractional (e.g. 28.5 squares). */
export interface LineItem {
  key: string; // stable id used for diffs and material mapping, e.g. "shingles"
  description: string;
  category: string;
  unit: Unit;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  depreciationPct: number; // 0-100, applied to this line to get ACV
}

export interface EstimateSettings {
  overheadPct: number;
  profitPct: number;
  taxPct: number;
  deductibleCents: number;
}

export interface EstimateTotals {
  lineTotals: Record<string, number>;
  subtotalCents: number;
  overheadCents: number;
  profitCents: number;
  taxCents: number;
  rcvCents: number; // replacement cost value
  depreciationCents: number;
  acvCents: number; // actual cash value
  deductibleCents: number;
  netClaimCents: number; // what the carrier pays now: ACV minus deductible, never below zero
}

export interface MeasurementInput {
  totals: { areaSqFt: number; squares: number; wastePct: number };
  linear: { ridge: number; hip: number; valley: number; eave: number; rake: number };
  facets: { id: string; areaSqFt: number; pitch: string }[];
}
