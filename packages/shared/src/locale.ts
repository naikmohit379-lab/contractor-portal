export interface LocaleFormatOptions {
  currency?: string;
  locale?: string;
  timezone?: string;
}

const defaults: Required<LocaleFormatOptions> = { currency: "USD", locale: "en-US", timezone: "America/Chicago" };

export function resolveLocalizedText(language: "en" | "hi", english: string, localized?: string) {
  return language === "hi" ? localized ?? english : english;
}

export function interpolateText(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export const squareFeetToSquareMeters = (squareFeet: number) => squareFeet * 0.09290304;
export const feetToMeters = (feet: number) => feet * 0.3048;

export function formatMinorCurrency(amountMinor: number, preferences: LocaleFormatOptions = {}) {
  const options = { ...defaults, ...preferences };
  return new Intl.NumberFormat(options.locale, { style: "currency", currency: options.currency }).format(amountMinor / 100);
}

export function formatLocaleDate(iso: string, preferences: LocaleFormatOptions = {}): string {
  const options = { ...defaults, ...preferences };
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatLocaleCalendarDate(iso, options);
  return new Date(iso).toLocaleDateString(options.locale, { month: "short", day: "numeric", year: "numeric", timeZone: options.timezone });
}

/** Format a calendar date without allowing timezone conversion to move it to another day. */
export function formatLocaleCalendarDate(iso: string, preferences: LocaleFormatOptions = {}): string {
  const options = { ...defaults, ...preferences };
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return formatLocaleDate(iso, options);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(options.locale, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function formatLocaleDateTime(iso: string, preferences: LocaleFormatOptions = {}) {
  const options = { ...defaults, ...preferences };
  return new Date(iso).toLocaleString(options.locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: options.timezone });
}
