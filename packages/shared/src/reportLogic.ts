// Pure reporting rules shared by the API and the web app. All money is integer cents.

const DAY = 24 * 60 * 60 * 1000;
const ms = (d: string | Date) => new Date(d).getTime();
export const ageDays = (from: string | Date, now = new Date()) => Math.max(Math.floor((now.getTime() - ms(from)) / DAY), 0);

// ---------------------------------------------------------------- waiver aging
export const AGING_BUCKETS = [
  { key: "0-3", label: "0 to 3 days", min: 0, max: 3 },
  { key: "4-7", label: "4 to 7 days", min: 4, max: 7 },
  { key: "8-14", label: "8 to 14 days", min: 8, max: 14 },
  { key: "15+", label: "15 days or more", min: 15, max: Infinity },
] as const;

export interface AgingBucket {
  key: string;
  label: string;
  count: number;
  oldestDays: number;
}

/** Groups unanswered requests by how long they have been waiting. */
export function agingBuckets(items: { requestedAt: string | Date }[], now = new Date()): AgingBucket[] {
  return AGING_BUCKETS.map((b) => {
    const ages = items.map((i) => ageDays(i.requestedAt, now)).filter((a) => a >= b.min && a <= b.max);
    return { key: b.key, label: b.label, count: ages.length, oldestDays: ages.length ? Math.max(...ages) : 0 };
  });
}

// ---------------------------------------------------------------- claims
const DECISIONS = new Set(["approved", "partially_approved", "denied"]);

/** Days from the claim being submitted to the carrier's first decision. Null if it has not been decided. */
export function claimCycleDays(history: { to: string; at: string | Date }[]): number | null {
  const sorted = [...history].sort((a, b) => ms(a.at) - ms(b.at));
  const submitted = sorted.find((h) => h.to === "submitted");
  if (!submitted) return null;
  const decision = sorted.find((h) => DECISIONS.has(h.to) && ms(h.at) >= ms(submitted.at));
  return decision ? Math.max(Math.round(((ms(decision.at) - ms(submitted.at)) / DAY) * 10) / 10, 0) : null;
}

export function averageCycleDays(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((n, x) => n + x, 0) / v.length) * 10) / 10 : null;
}

export interface ApprovalStats {
  decided: number;
  requestedCents: number;
  approvedCents: number;
  ratePct: number | null;
}

/** Approved versus requested, over claims the carrier has decided. A denial counts as $0 approved. */
export function approvalStats(claims: { status: string; requestedCents: number; approvedCents?: number | null }[]): ApprovalStats {
  const decided = claims.filter((c) => DECISIONS.has(c.status));
  const requestedCents = decided.reduce((n, c) => n + c.requestedCents, 0);
  const approvedCents = decided.reduce((n, c) => n + (c.approvedCents ?? 0), 0);
  return { decided: decided.length, requestedCents, approvedCents, ratePct: requestedCents > 0 ? Math.round((approvedCents / requestedCents) * 1000) / 10 : null };
}

// ---------------------------------------------------------------- money over time
export const monthKey = (d: string | Date) => new Date(d).toISOString().slice(0, 7);

/** The last `n` calendar months (UTC) as YYYY-MM, oldest first, ending with the current month. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

/** Sums signed cash movements into month buckets. Months with no activity show 0. */
export function monthlyTotals(entries: { at: string | Date; deltaCents: number }[], months: string[]): { month: string; cents: number }[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const e of entries) {
    const k = monthKey(e.at);
    if (totals.has(k)) totals.set(k, totals.get(k)! + e.deltaCents);
  }
  return months.map((month) => ({ month, cents: totals.get(month)! }));
}

// ---------------------------------------------------------------- receivables
export interface MilestoneMoney {
  expectedCents: number;
  status: string; // pending | ready | paid
  dueDate?: string | Date | null;
  netCollectedCents: number;
  openRequestedCents: number;
}

export interface Receivables {
  billedOutstandingCents: number; // ready to bill or billed, not yet collected
  awaitingWaiversCents: number; // cannot be billed until waivers are in
  overdueCents: number; // past due date and unpaid, either state
  openRequestedCents: number; // payment links sent and not yet settled
}

export function receivablesSummary(milestones: MilestoneMoney[], now = new Date()): Receivables {
  const r: Receivables = { billedOutstandingCents: 0, awaitingWaiversCents: 0, overdueCents: 0, openRequestedCents: 0 };
  for (const m of milestones) {
    if (m.status === "paid") continue;
    const owed = Math.max(m.expectedCents - m.netCollectedCents, 0);
    if (owed === 0) continue;
    if (m.status === "ready") r.billedOutstandingCents += owed;
    else r.awaitingWaiversCents += owed;
    if (m.dueDate && ms(m.dueDate) < now.getTime()) r.overdueCents += owed;
    r.openRequestedCents += m.openRequestedCents;
  }
  return r;
}

// ---------------------------------------------------------------- CSV export
type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 CSV. Text cells that start with = + - @ (or a tab/CR) are prefixed with an apostrophe so a
 * spreadsheet cannot run them as a formula (CSV injection). Real numbers are written as they are.
 */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "string" ? v : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
