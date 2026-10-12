import { describe, expect, it } from "vitest";
import { canTransitionClaim } from "./claims";
import { canTransitionPO } from "./orders";

describe("workflow state machines", () => {
  it("claims move forward only along allowed paths", () => {
    expect(canTransitionClaim("draft", "submitted")).toBe(true);
    expect(canTransitionClaim("draft", "approved")).toBe(false);
    expect(canTransitionClaim("closed", "submitted")).toBe(false);
  });
  it("purchase orders cannot leave a terminal state", () => {
    expect(canTransitionPO("draft", "sent")).toBe(true);
    expect(canTransitionPO("delivered", "cancelled")).toBe(false);
  });
});
