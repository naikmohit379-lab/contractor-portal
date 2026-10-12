import { describe, expect, it } from "vitest";
import { defaultRequestType, isExpired, milestoneReadiness, namesMatch } from "./waiverLogic";

const parties = [
  { id: "s", name: "Shingle Supply Co", requiresWaiver: true },
  { id: "c", name: "Ridgeline Crews", requiresWaiver: true },
  { id: "o", name: "Owner", requiresWaiver: false },
];

describe("milestone readiness", () => {
  it("does not count a waiver of the wrong kind or one that is not signed", () => {
    const r = milestoneReadiness({ type: "progress", requireWaivers: true }, parties, [
      { partyId: "s", type: "conditional_progress", status: "signed" },
      { partyId: "c", type: "conditional_final", status: "signed" },
    ]);
    expect(r).toMatchObject({ ready: false, required: 2, signed: 1 });
    expect(r.missing.map((m) => m.partyId)).toEqual(["c"]);
    expect(milestoneReadiness({ type: "progress", requireWaivers: true }, parties, [{ partyId: "s", type: "conditional_progress", status: "requested" }]).signed).toBe(0);
  });
  it("is ready when every required party has signed, and always ready when waivers are off", () => {
    expect(milestoneReadiness({ type: "final", requireWaivers: true }, parties, [
      { partyId: "s", type: "conditional_final", status: "signed" },
      { partyId: "c", type: "unconditional_final", status: "signed" },
    ]).ready).toBe(true);
    expect(milestoneReadiness({ type: "deposit", requireWaivers: false }, parties, []).ready).toBe(true);
  });
});

describe("helpers", () => {
  it("picks the conditional form for the request", () => {
    expect(defaultRequestType("final")).toBe("conditional_final");
    expect(defaultRequestType("deposit")).toBe("conditional_progress");
  });
  it("matches names loosely but not unrelated ones", () => {
    expect(namesMatch("shingle supply co.", ["Shingle Supply Co"])).toBe(true);
    expect(namesMatch("Someone Else", ["Ridgeline Crews"])).toBe(false);
  });
  it("only expires unanswered requests", () => {
    const past = new Date(Date.now() - 1000);
    expect(isExpired("requested", past)).toBe(true);
    expect(isExpired("signed", past)).toBe(false);
  });
});
