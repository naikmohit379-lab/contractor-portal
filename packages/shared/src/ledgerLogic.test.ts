import { describe, expect, it } from "vitest";
import { accountBalance, isBalanced, isMilestonePaid, outstandingCents, paymentReceivedLines, refundLines, refundNeedsApproval, totalNetCollected } from "./ledgerLogic";

describe("ledger", () => {
  it("posts balanced entries and nets payments against refunds", () => {
    const lines = [...paymentReceivedLines(50000), ...refundLines(12000)];
    expect(isBalanced(paymentReceivedLines(50000))).toBe(true);
    expect(isBalanced(lines)).toBe(true);
    expect(accountBalance(lines, "cash")).toBe(38000);
    expect(accountBalance(lines, "receivable")).toBe(-38000);
  });
  it("detects an unbalanced group", () => {
    expect(isBalanced([{ account: "cash", direction: "debit", amountCents: 100 }])).toBe(false);
  });
});

describe("payment totals", () => {
  const pays = [
    { status: "succeeded", amountCents: 60000, refundedCents: 0 },
    { status: "partially_refunded", amountCents: 40000, refundedCents: 10000 },
    { status: "requested", amountCents: 20000, refundedCents: 0 },
    { status: "failed", amountCents: 99999, refundedCents: 0 },
  ];
  it("counts only settled money, net of refunds", () => expect(totalNetCollected(pays)).toBe(90000));
  it("reserves open requests when working out what can still be requested", () => expect(outstandingCents(150000, pays)).toBe(40000));
  it("marks a milestone paid only when net collected covers it", () => {
    expect(isMilestonePaid(90000, pays)).toBe(true);
    expect(isMilestonePaid(90001, pays)).toBe(false);
    expect(isMilestonePaid(0, pays)).toBe(false);
  });
  it("requires approval only above the threshold, and never when it is 0", () => {
    expect(refundNeedsApproval(100001, 100000)).toBe(true);
    expect(refundNeedsApproval(100000, 100000)).toBe(false);
    expect(refundNeedsApproval(999999, 0)).toBe(false);
  });
});

import { checkPaymentLedger } from "./ledgerLogic";
describe("reconciliation", () => {
  const post = (g: string, lines: ReturnType<typeof paymentReceivedLines>) => lines.map((l) => ({ ...l, group: g }));
  it("passes when the ledger matches the payment", () => {
    const lines = [...post("a", paymentReceivedLines(50000)), ...post("b", refundLines(10000))];
    expect(checkPaymentLedger({ status: "partially_refunded", amountCents: 50000, refundedCents: 10000 }, lines)).toEqual([]);
  });
  it("reports a missing posting and a gateway flag", () => {
    const issues = checkPaymentLedger({ status: "succeeded", amountCents: 50000, refundedCents: 0, flag: "amount_mismatch" }, []);
    expect(issues.length).toBe(2);
  });
});
