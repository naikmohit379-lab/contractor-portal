import { DEFAULT_PRICES } from "./prices";
import type { LineItem, MeasurementInput } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const pitchRise = (p: string) => parseInt(p.split("/")[0] ?? "0", 10) || 0;

/** Standard re-roof line items, with quantities taken from a delivered measurement report. */
export function buildRoofReplacementItems(m: MeasurementInput, prices = DEFAULT_PRICES): LineItem[] {
  const squares = m.totals.areaSqFt / 100;
  const withWaste = round1(squares * (1 + m.totals.wastePct / 100));
  const eaveRake = m.linear.eave + m.linear.rake;
  const steepSquares = round1(m.facets.filter((f) => pitchRise(f.pitch) >= 7).reduce((n, f) => n + f.areaSqFt, 0) / 100);

  const qty: Record<string, number> = {
    tear_off: round1(squares),
    underlayment: round1(squares),
    shingles: withWaste,
    starter: eaveRake,
    ridge_cap: m.linear.ridge + m.linear.hip,
    drip_edge: eaveRake,
    valley_metal: m.linear.valley,
    pipe_jacks: 3,
    steep: steepSquares,
    haul_off: 1,
  };

  return Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([key, quantity]) => {
      const p = prices[key]!;
      return {
        key,
        description: p.description,
        category: p.category,
        unit: p.unit,
        quantity,
        unitPriceCents: p.unitPriceCents,
        taxable: p.taxable,
        depreciationPct: 0,
      };
    });
}

export const DEFAULT_SETTINGS = { overheadPct: 10, profitPct: 10, taxPct: 0, deductibleCents: 0 };
