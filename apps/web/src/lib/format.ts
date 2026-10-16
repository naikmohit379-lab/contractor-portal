export const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const dollarsToCents = (d: number) => Math.round(d * 100);
export const centsToDollars = (c: number) => (c / 100).toFixed(2);
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
/** Format a calendar date without letting the viewer's timezone move it to another day. */
export const fmtCalendarDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return fmtDate(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
};
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
