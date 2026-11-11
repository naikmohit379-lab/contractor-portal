import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoofVReportPdf, getRoofVQuota } from "./roofVProvider";

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
      headers: expect.objectContaining({ Authorization: "Bearer server-only-test-key", "User-Agent": "Roofora/1.0" }),
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

describe("RoofV original report PDF", () => {
  it("downloads and validates the saved-job PDF using server-side credentials", async () => {
    const pdf = Buffer.from("%PDF-1.7\nRoofV test report");
    const fetchMock = vi.fn().mockResolvedValue(new Response(pdf, {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=roof-report.pdf" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRoofVReportPdf("roofv-job-123", "server-only-test-key", "https://roofv.test/api/public/v1");

    expect(fetchMock).toHaveBeenCalledWith("https://roofv.test/api/public/v1/jobs/roofv-job-123/report.pdf", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer server-only-test-key", Accept: "application/pdf" }),
    }));
    expect(result).toEqual({ bytes: pdf, filename: "roof-report.pdf" });
    expect(JSON.stringify(result)).not.toContain("server-only-test-key");
  });

  it("treats a not-yet-published PDF as unavailable without failing the measurement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(fetchRoofVReportPdf("roofv-job-123", "server-only-test-key", "https://roofv.test/api/public/v1")).resolves.toBeUndefined();
  });

  it("rejects a response that is not a PDF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>not a report</html>", { status: 200 })));
    await expect(fetchRoofVReportPdf("roofv-job-123", "server-only-test-key", "https://roofv.test/api/public/v1")).rejects.toThrow("not a valid PDF");
  });
});
