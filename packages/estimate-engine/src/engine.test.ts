import { describe, expect, it } from "vitest";
import { buildMaterialList, buildRoofReplacementItems, computeTotals, diffVersions } from "./index";

const m = {
  totals: { areaSqFt: 2800, squares: 28, wastePct: 12 },
  linear: { ridge: 40, hip: 60, valley: 20, eave: 120, rake: 40 },
  facets: [
    { id: "A", areaSqFt: 1400, pitch: "7/12" },
    { id: "B", areaSqFt: 1400, pitch: "5/12" },
  ],
};

describe("estimate engine", () => {
  const items = buildRoofReplacementItems(m);

  it("builds quantities from measurements, with waste on shingles and steep charge on 7/12+ facets", () => {
    const q = Object.fromEntries(items.map((i) => [i.key, i.quantity]));
    expect(q.tear_off).toBe(28);
    expect(q.shingles).toBe(31.4); // 28 * 1.12
    expect(q.ridge_cap).toBe(100);
    expect(q.drip_edge).toBe(160);
    expect(q.steep).toBe(14);
  });

  it("computes O&P, tax, depreciation and the net claim", () => {
    const t = computeTotals(
      [{ key: "a", description: "a", category: "x", unit: "SQ", quantity: 10, unitPriceCents: 10000, taxable: true, depreciationPct: 20 }],
      { overheadPct: 10, profitPct: 10, taxPct: 8, deductibleCents: 25000 },
    );
    expect(t.subtotalCents).toBe(100000);
    expect(t.overheadCents).toBe(10000);
    expect(t.taxCents).toBe(8000);
    expect(t.rcvCents).toBe(128000);
    expect(t.depreciationCents).toBe(20000);
    expect(t.acvCents).toBe(108000);
    expect(t.netClaimCents).toBe(83000);
  });

  it("never returns a negative net claim", () => {
    const t = computeTotals([], { overheadPct: 10, profitPct: 10, taxPct: 0, deductibleCents: 5000 });
    expect(t.netClaimCents).toBe(0);
  });

  it("diffs versions by key", () => {
    const next = items.filter((i) => i.key !== "haul_off").map((i) => (i.key === "shingles" ? { ...i, quantity: 35 } : i));
    next.push({ ...items[0]!, key: "gutters", description: "Gutters", quantity: 1, unitPriceCents: 50000 });
    const d = diffVersions(items, next);
    expect(d.removed.map((i) => i.key)).toEqual(["haul_off"]);
    expect(d.added.map((i) => i.key)).toEqual(["gutters"]);
    expect(d.changed.map((c) => c.key)).toEqual(["shingles"]);
  });

  it("rounds material packages up and skips labor-only lines", () => {
    const list = buildMaterialList(items);
    const q = Object.fromEntries(list.map((l) => [l.key, l.quantity]));
    expect(q.shingles).toBe(95); // ceil(31.4 * 3)
    expect(q.underlayment).toBe(3);
    expect(q.ridge_cap).toBe(4);
    expect(q.tear_off).toBeUndefined();
  });
});
