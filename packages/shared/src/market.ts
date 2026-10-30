import { z } from "zod";

export const MARKET_COUNTRIES = ["IN", "US"] as const;
export type MarketCountry = (typeof MARKET_COUNTRIES)[number];
export const CURRENCIES = ["INR", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const LANGUAGES = ["en", "hi"] as const;
export type LanguageCode = (typeof LANGUAGES)[number];
export const MEASUREMENT_SYSTEMS = ["metric", "imperial"] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];

export interface CompanyMarketSettings {
  country: MarketCountry;
  currency: CurrencyCode;
  locale: "en-IN" | "hi-IN" | "en-US";
  language: LanguageCode;
  timezone: string;
  measurementSystem: MeasurementSystem;
}

// Defaults are intentionally U.S.-safe for legacy MongoDB documents. New Indian
// companies receive INDIA_MARKET_DEFAULTS explicitly in the registration route.
export const LEGACY_MARKET_DEFAULTS: CompanyMarketSettings = {
  country: "US",
  currency: "USD",
  locale: "en-US",
  language: "en",
  timezone: "America/Chicago",
  measurementSystem: "imperial",
};

export const INDIA_MARKET_DEFAULTS: CompanyMarketSettings = {
  country: "IN",
  currency: "INR",
  locale: "en-IN",
  language: "en",
  timezone: "Asia/Kolkata",
  measurementSystem: "metric",
};

export const companyMarketSettingsSchema = z.object({
  country: z.enum(MARKET_COUNTRIES),
  currency: z.enum(CURRENCIES),
  locale: z.enum(["en-IN", "hi-IN", "en-US"]),
  language: z.enum(LANGUAGES),
  timezone: z.string().trim().min(1).max(80).refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid time zone, such as Asia/Kolkata"),
  measurementSystem: z.enum(MEASUREMENT_SYSTEMS),
});

export function normalizeMarketSettings(settings?: Partial<CompanyMarketSettings> | null): CompanyMarketSettings {
  return { ...LEGACY_MARKET_DEFAULTS, ...settings };
}
