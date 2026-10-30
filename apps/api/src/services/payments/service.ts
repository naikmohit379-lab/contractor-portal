import { randomUUID } from "node:crypto";
import mongoose, { isValidObjectId, type ClientSession } from "mongoose";
import { isMilestonePaid, paymentReceivedLines, refundLines, type LedgerLine } from "@roofdesk/shared";
import { requestContext } from "../../core/context";
import { formatCurrency } from "../../core/format";
import { notify, touchJob } from "../../core/notify";
import { AuditLog } from "../../models/AuditLog";
import { LedgerEntry } from "../../models/LedgerEntry";
import { Payment } from "../../models/Payment";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { ProviderEvent } from "../../models/ProviderEvent";
import { Refund } from "../../models/Refund";
import { advanceStage } from "../jobs/stages";
import { getPaymentProvider } from "./providers";
import type { NormalizedEvent } from "./providers/types";

/**
 * Runs `fn` in one MongoDB transaction so the payment record, ledger postings and milestone status
 * can never be half-written. Needs a replica set (the Docker Compose setup provides one).
 */
export async function inTransaction<T>(fn: (s: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** System audit entry. Pass the session when called inside a transaction so it commits or rolls back with the change. */
export const audit = (companyId: unknown, action: string, entityId: unknown, meta?: unknown, session?: ClientSession) =>
  AuditLog.create([{ companyId, action, entity: "Payment", entityId, meta }], session ? { session } : undefined);

async function post(session: ClientSession, p: any, kind: "payment_received" | "refund", lines: LedgerLine[], memo: string) {
  const group = randomUUID();
  await LedgerEntry.insertMany(
    lines.map((l) => ({ ...l, companyId: p.companyId, jobId: p.jobId, paymentId: p._id, milestoneId: p.milestoneId, group, kind, memo })),
    { session },
  );
}

/** Marks a milestone paid (or back to ready) from the money actually kept, and closes the job on the final payment. */
export async function recomputeMilestone(session: ClientSession, milestoneId: unknown) {
  const [m, payments] = await Promise.all([
    PaymentMilestone.findById(milestoneId).session(session),
    Payment.find({ milestoneId }).session(session),
  ]);
  if (!m) return;
  const paid = isMilestonePaid(m.expectedAmountCents, payments.map((p) => ({ status: p.status, amountCents: p.amountCents, refundedCents: p.refundedCents })));
  if (paid && m.status !== "paid") {
    m.status = "paid";
    await m.save({ session });
    if (m.type === "final") await advanceStage(m.jobId, "paid");
  } else if (!paid && m.status === "paid") {
    m.status = "ready";
    await m.save({ session });
  }
}

const displayMoney = (cents: number, currency = "USD") => formatCurrency(cents, currency);

export type EventOutcome = "applied" | "duplicate" | "unmatched";

/**
 * The single place gateway events change money state. Safe to call twice with the same event:
 * the event id is recorded in the same transaction as the change, so redelivery does nothing.
 */
export async function applyProviderEvent(evt: NormalizedEvent): Promise<EventOutcome> {
  let found: any = null;
  if (evt.paymentId && isValidObjectId(evt.paymentId)) found = await Payment.findById(evt.paymentId).setOptions({ skipTenant: true });
  if (!found && evt.paymentIntentId) found = await Payment.findOne({ providerPaymentIntentId: evt.paymentIntentId }).setOptions({ skipTenant: true });
  if (!found) return "unmatched";

  const ctx = { companyId: String(found.companyId), userId: "system", role: "owner" as const };
  // Notifications and live updates are queued here and sent only after the transaction commits,
  // so nobody is told about a payment that was then rolled back.
  const after: (() => Promise<void>)[] = [];
  try {
    const outcome = await requestContext.run(ctx, () =>
      inTransaction(async (session): Promise<EventOutcome> => {
        after.length = 0; // a retried transaction starts clean
        if (await ProviderEvent.exists({ provider: evt.provider, eventId: evt.eventId }).session(session)) return "duplicate";
        await ProviderEvent.create([{ provider: evt.provider, eventId: evt.eventId, type: evt.type, companyId: found.companyId, paymentId: found._id }], { session });

        const p = await Payment.findById(found._id).session(session);
        if (!p) return "unmatched";
        const settled = ["succeeded", "partially_refunded", "refunded"].includes(p.status);

        switch (evt.type) {
          case "payment_succeeded": {
            if (settled) break;
            // The amount that arrived must equal the amount we asked for. If not, post nothing and flag it for a person.
            if ((evt.amountCents !== undefined && evt.amountCents !== p.amountCents) || (evt.currency && evt.currency.toUpperCase() !== p.currency)) {
              p.flag = "amount_mismatch";
              await p.save({ session });
              await audit(p.companyId, "payment.amount_mismatch", p._id, { expected: p.amountCents, got: evt.amountCents }, session);
              break;
            }
            if (p.status === "canceled") p.flag = "paid_after_cancel";
            p.status = "succeeded";
            p.paidAt = new Date();
            p.failureReason = undefined;
            if (evt.paymentIntentId) p.providerPaymentIntentId = evt.paymentIntentId;
            await p.save({ session });
            await post(session, p, "payment_received", paymentReceivedLines(p.amountCents), `Payment received: ${p.description}`);
            await recomputeMilestone(session, p.milestoneId);
            await audit(p.companyId, "payment.succeeded", p._id, { amountCents: p.amountCents }, session);
            after.push(async () => {
              touchJob(p.companyId, p.jobId, "payments", "milestones");
              await notify(p.companyId, { kind: "payment.succeeded", title: `Payment received: ${displayMoney(p.amountCents, p.currency)}`, body: `${p.payerName} paid for ${p.description}.`, href: `/jobs/${p.jobId}?tab=payments`, roles: ["owner", "admin", "billing"] });
            });
            break;
          }
          case "payment_processing":
            if (p.status === "requested" || p.status === "failed") {
              p.status = "pending";
              if (evt.paymentIntentId) p.providerPaymentIntentId = evt.paymentIntentId;
              await p.save({ session });
              after.push(async () => touchJob(p.companyId, p.jobId, "payments"));
            }
            break;
          case "payment_failed":
            if (p.status === "requested" || p.status === "pending") {
              p.status = "failed";
              p.failureReason = evt.failureReason ?? "The payment did not go through";
              await p.save({ session });
              await audit(p.companyId, "payment.failed", p._id, { reason: p.failureReason }, session);
              after.push(async () => {
                touchJob(p.companyId, p.jobId, "payments");
                await notify(p.companyId, { kind: "payment.failed", title: `Payment failed: ${displayMoney(p.amountCents, p.currency)}`, body: `${p.payerName}: ${p.failureReason}`, href: `/jobs/${p.jobId}?tab=payments`, roles: ["owner", "admin", "billing"] });
              });
            }
            break;
          case "refund_total": {
            // Cumulative total reported by the gateway. Refunds started from our app are already recorded, so only the difference is new.
            // If one of our own refunds is mid-flight, leave it: that flow posts its own ledger lines.
            if (await Refund.exists({ paymentId: p._id, status: "processing" }).session(session)) break;
            const delta = (evt.amountCents ?? 0) - p.refundedCents;
            if (delta > 0 && settled) {
              p.refundedCents += delta;
              p.status = p.refundedCents >= p.amountCents ? "refunded" : "partially_refunded";
              await p.save({ session });
              await Refund.create([{ companyId: p.companyId, paymentId: p._id, jobId: p.jobId, amountCents: delta, reason: "Refunded directly at the gateway", status: "processed", processedAt: new Date() }], { session });
              await post(session, p, "refund", refundLines(delta), "Refund made at the gateway");
              await recomputeMilestone(session, p.milestoneId);
              await audit(p.companyId, "payment.refunded_externally", p._id, { amountCents: delta }, session);
              after.push(async () => touchJob(p.companyId, p.jobId, "payments", "milestones"));
            }
            break;
          }
          case "dispute_opened":
            p.disputed = true;
            await p.save({ session });
            await audit(p.companyId, "payment.dispute_opened", p._id, undefined, session);
            after.push(async () => {
              touchJob(p.companyId, p.jobId, "payments");
              await notify(p.companyId, { kind: "payment.dispute", title: "A payment is being disputed", body: `${p.payerName} disputed ${displayMoney(p.amountCents, p.currency)} for ${p.description}. Gather your documents.`, href: `/jobs/${p.jobId}?tab=payments`, roles: ["owner", "admin", "billing"] });
            });
            break;
        }
        return "applied";
      }),
    );
    for (const fn of after) await fn().catch(() => undefined);
    return outcome;
  } catch (err: any) {
    if (err?.code === 11000) return "duplicate"; // two deliveries raced; the other one won
    throw err;
  }
}

/**
 * Sends a refund to the gateway and, only if it succeeds, records it. Call inside the tenant context.
 * The refund is marked "processing" first so a refund webhook that arrives early is not counted twice.
 */
export async function executeRefund(refundId: string): Promise<{ ok: boolean; error?: string }> {
  const refund = await Refund.findById(refundId);
  if (!refund) return { ok: false, error: "Refund not found" };
  const payment = await Payment.findById(refund.paymentId);
  if (!payment) return { ok: false, error: "Payment not found" };

  refund.status = "processing";
  await refund.save();
  try {
    const { refundId: providerRefundId } = await getPaymentProvider().refund({
      paymentIntentId: payment.providerPaymentIntentId ?? undefined,
      amountCents: refund.amountCents,
      idempotencyKey: `refund-${refund.id}`,
    });
    await inTransaction(async (session) => {
      const p = await Payment.findById(payment._id).session(session);
      const r = await Refund.findById(refund._id).session(session);
      if (!p || !r) return;
      p.refundedCents += r.amountCents;
      p.status = p.refundedCents >= p.amountCents ? "refunded" : "partially_refunded";
      await p.save({ session });
      r.status = "processed";
      r.providerRefundId = providerRefundId;
      r.processedAt = new Date();
      await r.save({ session });
      await post(session, p, "refund", refundLines(r.amountCents), `Refund: ${r.reason}`);
      await recomputeMilestone(session, p.milestoneId);
      await audit(p.companyId, "payment.refunded", p._id, { amountCents: r.amountCents, reason: r.reason }, session);
    });
    return { ok: true };
  } catch (err: any) {
    refund.status = "failed";
    refund.failureReason = String(err?.message ?? "The gateway rejected the refund").slice(0, 300);
    await refund.save();
    return { ok: false, error: refund.failureReason };
  }
}
