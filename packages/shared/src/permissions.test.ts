import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("permissions", () => {
  it("lets estimators order measurements but not refund payments", () => {
    expect(hasPermission("estimator", "measurement:order")).toBe(true);
    expect(hasPermission("estimator", "payment:refund")).toBe(false);
  });
  it("keeps read-only users read-only", () => {
    expect(hasPermission("readonly", "job:read")).toBe(true);
    expect(hasPermission("readonly", "job:write")).toBe(false);
  });
});
