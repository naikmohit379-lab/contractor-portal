// Pure money rules for payments and the ledger. All amounts are integer cents.

export type Account = "cash" | "receivable";
export interface LedgerLine {
  account: Account;
  direction: "debit" | "credit";
  amountCents: number;
}

/** Money received from the payer: cash goes up, what the payer owes goes down. */
export const paymentReceivedLines = (amountCents: number): LedgerLine[] => [
  { account: "cash", direction: "debit", amountCents },
  { account: "receivable", direction: "credit", amountCents },
];

/** Money returned to the payer: cash goes down, what the payer owes goes back up. */
export const refundLines = (amountCents: number): LedgerLine[] => [
  { account: "receivable", direction: "debit", amountCents },
  { account: "cash", direction: "credit", amountCents },
];

/** Every posting group must have equal debits and credits. */
export function isBalanced(lines: LedgerLine[]): boolean {
  const sum = (d: "debit" | "credit") => lines.filter((l) => l.direction === d).reduce((n, l) => n + l.amountCents, 0);
  return sum("debit") === sum("credit");
}

/** Debits minus credits for one account. For cash, a positive number is money collected. */
export function accountBalance(lines: LedgerLine[], account: Account): number {
  return lines
    .filter((l) => l.account === account)
    .reduce((n, l) => n + (l.direction === "debit" ? l.amountCents : -l.amountCents), 0);
}

export interface PaymentLike {
  status: string;
  amountCents: number;
  refundedCents: number;
}

const COLLECTED = new Set(["succeeded", "partially_refunded", "refunded"]);

/** Money actually kept for a payment: what was paid minus what was refunded. */
export const netCollectedCents = (p: PaymentLike) => (COLLECTED.has(p.status) ? p.amountCents - p.refundedCents : 0);

export const totalNetCollected = (payments: PaymentLike[]) => payments.reduce((n, p) => n + netCollectedCents(p), 0);

/** Requests that are out with a payer but not settled yet. They reserve part of the amount still owed. */
const OPEN = new Set(["requested", "pending"]);
export const openRequestedCents = (payments: PaymentLike[]) =>
  payments.filter((p) => OPEN.has(p.status)).reduce((n, p) => n + p.amountCents, 0);

/** How much more can still be requested for a payment milestone. */
export const outstandingCents = (expectedCents: number, payments: PaymentLike[]) =>
  Math.max(expectedCents - totalNetCollected(payments) - openRequestedCents(payments), 0);

/** A milestone is paid once the net money collected covers what was expected. */
export const isMilestonePaid = (expectedCents: number, payments: PaymentLike[]) =>
  expectedCents > 0 && totalNetCollected(payments) >= expectedCents;

/** Refunds above the threshold need a second person to approve. A threshold of 0 turns approval off. */
export const refundNeedsApproval = (amountCents: number, thresholdCents: number) => thresholdCents > 0 && amountCents > thresholdCents;

export interface PostedLine extends LedgerLine {
  group: string;
}

/**
 * Reconciliation check for one payment: do the posted ledger lines agree with the payment record?
 * Returns human-readable problems; an empty list means the payment reconciles.
 */
export function checkPaymentLedger(p: PaymentLike & { flag?: string }, lines: PostedLine[]): string[] {
  const issues: string[] = [];
  const expectedCash = netCollectedCents(p);
  const cash = accountBalance(lines, "cash");
  if (p.flag) issues.push(`Flagged by the gateway handler: ${p.flag}`);
  if (cash !== expectedCash) issues.push(`Ledger cash is ${cash} cents but the payment record nets to ${expectedCash} cents`);
  const groups = new Map<string, LedgerLine[]>();
  for (const l of lines) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);
  for (const [g, ls] of groups) if (!isBalanced(ls)) issues.push(`Ledger posting ${g} is not balanced`);
  return issues;
}
