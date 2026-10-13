import { describe, expect, it } from "vitest";
import { agingBuckets, approvalStats, averageCycleDays, claimCycleDays, lastMonths, monthlyTotals, receivablesSummary, toCsv } from "./reportLogic";

const now = new Date("2026-10-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("reports", () => {
  it("buckets waiting waivers by age", () => {
    const b = agingBuckets([{ requestedAt: daysAgo(1) }, { requestedAt: daysAgo(3) }, { requestedAt: daysAgo(9) }, { requestedAt: daysAgo(30) }], now);
    expect(b.map((x) => x.count)).toEqual([2, 0, 1, 1]);
    expect(b[3]!.oldestDays).toBe(30);
  });
  it("measures claim cycle from submission to the first decision", () => {
    expect(claimCycleDays([{ to: "draft", at: daysAgo(20) }, { to: "submitted", at: daysAgo(10) }, { to: "approved", at: daysAgo(4) }])).toBe(6);
    expect(claimCycleDays([{ to: "submitted", at: daysAgo(2) }])).toBeNull();
    expect(averageCycleDays([6, null, 10])).toBe(8);
    expect(averageCycleDays([null])).toBeNull();
  });
  it("computes approval rate over decided claims, counting a denial as zero", () => {
    const s = approvalStats([
      { status: "approved", requestedCents: 1000000, approvedCents: 900000 },
      { status: "denied", requestedCents: 500000 },
      { status: "submitted", requestedCents: 700000 },
    ]);
    expect(s).toEqual({ decided: 2, requestedCents: 1500000, approvedCents: 900000, ratePct: 60 });
  });
  it("totals cash by month and fills empty months", () => {
    const months = lastMonths(3, now);
    expect(months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(monthlyTotals([{ at: "2026-10-02T00:00:00Z", deltaCents: 5000 }, { at: "2026-10-09T00:00:00Z", deltaCents: -1000 }, { at: "2026-06-01T00:00:00Z", deltaCents: 99 }], months)).toEqual([
      { month: "2026-08", cents: 0 }, { month: "2026-09", cents: 0 }, { month: "2026-10", cents: 4000 },
    ]);
  });
  it("splits receivables into billed, waiting on waivers and overdue", () => {
    const r = receivablesSummary([
      { expectedCents: 100000, status: "ready", dueDate: daysAgo(5), netCollectedCents: 40000, openRequestedCents: 20000 },
      { expectedCents: 80000, status: "pending", dueDate: daysAgo(1), netCollectedCents: 0, openRequestedCents: 0 },
      { expectedCents: 50000, status: "paid", dueDate: daysAgo(30), netCollectedCents: 50000, openRequestedCents: 0 },
      { expectedCents: 30000, status: "ready", dueDate: new Date(now.getTime() + 86_400_000), netCollectedCents: 0, openRequestedCents: 0 },
    ], now);
    expect(r).toEqual({ billedOutstandingCents: 90000, awaitingWaiversCents: 80000, overdueCents: 140000, openRequestedCents: 20000 });
  });
  it("writes safe CSV", () => {
    expect(toCsv([["name", "note"], ["Smith, J", 'said "hi"'], ["=HYPERLINK(\"x\")", -5], [null, "line\nbreak"]]))
      .toBe('name,note\r\n"Smith, J","said ""hi"""\r\n"\'=HYPERLINK(""x"")",-5\r\n,"line\nbreak"\r\n');
  });
});
