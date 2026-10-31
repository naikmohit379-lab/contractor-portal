import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoofVQuota } from "./roofVProvider";

afterEach(() => vi.unstubAllGlobals());

describe("RoofV quota check", () => {
  it("reads quota with a server-side bearer key and returns no account identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        user: { name: "Private User", email: "private@example.com" },
        abilities: ["measurements:write"],
        measurement_quota: {
          period: "2026-10", included: 30, included_used: 4, included_remaining: 26,
          credits_balance: 0, credits_per_measurement: 3, measurements_available: 26,
          resets_at: "2026-11-01T00:00:00.000Z",
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const quota = await getRoofVQuota("server-only-test-key", "https://roofv.test/api/public/v1");

    expect(fetchMock).toHaveBeenCalledWith("https://roofv.test/api/public/v1/me", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer server-only-test-key", "User-Agent": "RoofDesk/1.0" }),
    }));
    expect(quota).toEqual({
      period: "2026-10", included: 30, includedUsed: 4, includedRemaining: 26,
      creditsBalance: 0, creditsPerMeasurement: 3, measurementsAvailable: 26,
      resetsAt: "2026-11-01T00:00:00.000Z",
    });
    expect(JSON.stringify(quota)).not.toContain("private@example.com");
  });

  it("does not make a request when no API key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRoofVQuota(undefined, "https://roofv.test/api/public/v1")).rejects.toThrow("API key is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports invalid or expired keys without exposing response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "do not echo" } }), { status: 401 })));

    await expect(getRoofVQuota("bad-key", "https://roofv.test/api/public/v1")).rejects.toThrow("HTTP 401");
    await expect(getRoofVQuota("bad-key", "https://roofv.test/api/public/v1")).rejects.not.toThrow("do not echo");
  });
});
