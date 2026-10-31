import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addUser, registerCompany, startTestApp, type TestApp } from "./helpers";

process.env.ROOFV_API_KEY = "quota-integration-test-key";
process.env.ROOFV_ENABLED = "false";

let app: TestApp;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await app.close(); vi.unstubAllGlobals(); });

describe("RoofV free quota endpoint", () => {
  it("requires a session and measurement permission", async () => {
    const unauthenticated = await app.call("GET", "/providers/roofv/quota");
    expect(unauthenticated.status).toBe(401);

    const owner = await registerCompany(app);
    const operations = await addUser(app, owner.companyId, "operations");
    const forbidden = await app.call("GET", "/providers/roofv/quota", { token: operations.token });
    expect(forbidden.status).toBe(403);
  });

  it("returns only quota fields from RoofV /me and does not require ordering to be enabled", async () => {
    const owner = await registerCompany(app);
    const realFetch = globalThis.fetch;
    const roofVResponse = new Response(JSON.stringify({
      data: {
        user: { name: "Private User", email: "private@example.com" },
        abilities: ["measurements:write"],
        measurement_quota: {
          period: "2026-10", included: 30, included_used: 4, included_remaining: 26,
          credits_balance: 0, credits_per_measurement: 3, measurements_available: 26,
          resets_at: "2026-11-01T00:00:00.000Z",
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://roofv.ai/")
        ? Promise.resolve(roofVResponse.clone())
        : realFetch(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.call("GET", "/providers/roofv/quota", { token: owner.token });

    expect(response.status).toBe(200);
    expect(response.body.quota.includedRemaining).toBe(26);
    expect(response.body.quota.creditsBalance).toBe(0);
    expect(JSON.stringify(response.body)).not.toContain("private@example.com");
    expect(JSON.stringify(response.body)).not.toContain("measurements:write");
    const roofVCalls = fetchMock.mock.calls.filter(([input]) => String(input).startsWith("https://roofv.ai/"));
    expect(roofVCalls).toHaveLength(1);
    expect(roofVCalls[0]?.[0]).toBe("https://roofv.ai/api/public/v1/me");
  });
});
