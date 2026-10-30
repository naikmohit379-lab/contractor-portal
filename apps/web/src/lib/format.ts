import { formatLocaleCalendarDate, formatLocaleDate, formatLocaleDateTime, formatMinorCurrency, type LocaleFormatOptions } from "@roofdesk/shared";

export type FormatPreferences = LocaleFormatOptions;

let companyFormat: FormatPreferences = {};

/** Keep legacy screens company-aware while callers are migrated to explicit preferences. */
export function setCompanyFormatPreferences(preferences?: FormatPreferences) {
  companyFormat = preferences ?? {};
}

const preferences = (overrides?: FormatPreferences) => ({ ...companyFormat, ...overrides });

export const formatCurrency = (amountMinor: number, options?: FormatPreferences) => formatMinorCurrency(amountMinor, preferences(options));
export const usd = (amountMinor: number, options?: FormatPreferences) => formatCurrency(amountMinor, options);
// The stored integer is a two-decimal minor unit. For India it represents paise.
export const dollarsToCents = (amount: number) => Math.round(amount * 100);
export const centsToDollars = (amountMinor: number) => (amountMinor / 100).toFixed(2);
export const fmtDate = (iso: string, options?: FormatPreferences) => formatLocaleDate(iso, preferences(options));
export const fmtCalendarDate = (iso: string, options?: FormatPreferences) => formatLocaleCalendarDate(iso, preferences(options));
export const fmtDateTime = (iso: string, options?: FormatPreferences) => formatLocaleDateTime(iso, preferences(options));
