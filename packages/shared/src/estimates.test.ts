import { describe, expect, it } from "vitest";
import { estimateHandoffCsv, parseCsv, type EstimateVersionDTO } from "./index";

const version: EstimateVersionDTO = {
  versionNo: 2,
  kind: "supplement",
  lineItems: [{ key: "roofing", category: "Roofing", description: '=HYPERLINK("https://bad.example")', quantity: 10, unit: "SQ", unitPriceCents: 12500, taxable: true, depreciationPct: 10 }],
  settings: { overheadPct: 10, profitPct: 10, taxPct: 0, deductibleCents: 50000 },
  totals: { subtotalCents: 125000, overheadCents: 12500, profitCents: 13750, taxCents: 0, rcvCents: 151250, depreciationCents: 12500, acvCents: 138750, netClaimCents: 88750 },
  createdAt: "2026-10-16T00:00:00.000Z",
};

describe("estimate handoff CSV", () => {
  it("exports line details, INR currency code, and quotation totals as safely quoted CSV", () => {
    const csv = estimateHandoffCsv(
      { jobNumber: "RD-101", customerName: "A. Customer", address: "1 Main Road, Bengaluru, Karnataka" },
      version,
      { lineTotals: { roofing: 125000 }, subtotalCents: 125000, overheadCents: 12500, profitCents: 13750, taxCents: 0, rcvCents: 151250, depreciationCents: 12500, acvCents: 138750, deductibleCents: 50000, netClaimCents: 88750 },
    );
    const rows = csv.trim().split("\r\n");
    const parsed = parseCsv(csv);
    expect(parsed[0]).toHaveLength(20);
    expect(parsed[1]).toHaveLength(20);
    expect(parsed[2]).toHaveLength(20);
    expect(parsed[0]).toContain("currency_code");
    expect(parsed[1]![12]).toBe("INR");
    expect(parsed[1]![14]).toBe("1250.00");
    expect(rows[0]).toContain('"line_total"');
    expect(rows[1]).toContain("\"'=HYPERLINK");
    expect(rows[1]).toContain('"1250.00"');
    expect(rows[2]).toContain('"TOTAL"');
    expect(rows[2]).toContain('"1512.50"');
    expect(rows[2]).toContain('"1512.50"');
  });
});
