import type { EstimateSettings, EstimateTotals, LineItem } from "./types";

const pct = (cents: number, p: number) => Math.round((cents * p) / 100);

export const lineTotalCents = (i: LineItem) => Math.round(i.quantity * i.unitPriceCents);

/**
 * Totals shared by the web preview and the API, so both always agree.
 * - Overhead and profit apply to the line subtotal.
 * - Tax applies to taxable lines only (before O&P).
 * - Depreciation is taken per line on the line total.
 */
export function computeTotals(items: LineItem[], s: EstimateSettings): EstimateTotals {
  const lineTotals: Record<string, number> = {};
  let subtotal = 0;
  let taxableBase = 0;
  let depreciation = 0;

  for (const i of items) {
    const t = lineTotalCents(i);
    lineTotals[i.key] = t;
    subtotal += t;
    if (i.taxable) taxableBase += t;
    depreciation += pct(t, Math.min(Math.max(i.depreciationPct, 0), 100));
  }

  const overhead = pct(subtotal, s.overheadPct);
  const profit = pct(subtotal, s.profitPct);
  const tax = pct(taxableBase, s.taxPct);
  const rcv = subtotal + overhead + profit + tax;
  const acv = rcv - depreciation;

  return {
    lineTotals,
    subtotalCents: subtotal,
    overheadCents: overhead,
    profitCents: profit,
    taxCents: tax,
    rcvCents: rcv,
    depreciationCents: depreciation,
    acvCents: acv,
    deductibleCents: s.deductibleCents,
    netClaimCents: Math.max(acv - s.deductibleCents, 0),
  };
}

export const formatUsd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
