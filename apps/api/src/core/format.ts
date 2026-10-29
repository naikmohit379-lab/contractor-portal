export function formatCurrency(amountMinor: number, currency = "USD", locale = currency === "INR" ? "en-IN" : "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
