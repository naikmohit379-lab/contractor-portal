import { describe, expect, it } from "vitest";
import { INDIA_MARKET_DEFAULTS, LEGACY_MARKET_DEFAULTS, companyMarketSettingsSchema, normalizeMarketSettings } from "./market";
import { jobCreateSchema } from "./schemas";
import { feetToMeters, formatLocaleDateTime, formatLocaleDate, formatMinorCurrency, interpolateText, resolveLocalizedText, squareFeetToSquareMeters } from "./locale";

const baseJob = { customer: { name: "Test Customer" }, type: "residential" as const };

describe("India-first market compatibility", () => {
  it("accepts Indian addresses with a district and PIN without U.S. ZIP fields", () => {
    const result = jobCreateSchema.safeParse({ ...baseJob, property: {
      line1: "12 Example Road", city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka", pinCode: "560001", country: "IN",
    } });
    expect(result.success).toBe(true);
  });

  it("rejects U.S. addresses when creating new jobs", () => {
    const result = jobCreateSchema.safeParse({ ...baseJob, property: { line1: "14 Oak Ridge Ln", city: "Austin", state: "TX", zip: "78701", country: "US" } });
    expect(result.success).toBe(false);
  });

  it("requires a six-digit PIN and district and rejects U.S. address formats", () => {
    expect(jobCreateSchema.safeParse({ ...baseJob, property: { line1: "12 Example Road", city: "Bengaluru", state: "Karnataka", country: "IN", pinCode: "56000" } }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ ...baseJob, property: { line1: "12 Example Road", city: "Austin", state: "Texas", zip: "78701", country: "US" } }).success).toBe(false);
  });

  it("uses India defaults for new companies while preserving U.S. defaults for legacy records", () => {
    expect(INDIA_MARKET_DEFAULTS).toMatchObject({ country: "IN", currency: "INR", locale: "en-IN", language: "en", timezone: "Asia/Kolkata", measurementSystem: "metric" });
    expect(normalizeMarketSettings(undefined)).toEqual(LEGACY_MARKET_DEFAULTS);
    expect(companyMarketSettingsSchema.safeParse(INDIA_MARKET_DEFAULTS).success).toBe(true);
  });

  it("uses Hindi strings when available and falls back to English for missing translations", () => {
    expect(resolveLocalizedText("hi", "Settings", "सेटिंग्स")).toBe("सेटिंग्स");
    expect(resolveLocalizedText("hi", "Reports")).toBe("Reports");
    expect(interpolateText("Welcome, {name}", { name: "Priya" })).toBe("Welcome, Priya");
  });

  it("formats INR amounts and dates/times with the company locale and timezone", () => {
    expect(formatMinorCurrency(123456, { currency: "INR", locale: "en-IN" })).toContain("₹");
    expect(formatLocaleDate("2026-10-29", { locale: "hi-IN", timezone: "Asia/Kolkata" })).toContain("2026");
    expect(formatLocaleDateTime("2026-01-01T00:00:00.000Z", { locale: "en-IN", timezone: "Asia/Kolkata" })).toMatch(/5:30/);
  });

  it("converts provider square feet and feet into display-only metric values", () => {
    expect(squareFeetToSquareMeters(100)).toBeCloseTo(9.2903, 3);
    expect(feetToMeters(10)).toBeCloseTo(3.048, 3);
  });
});
