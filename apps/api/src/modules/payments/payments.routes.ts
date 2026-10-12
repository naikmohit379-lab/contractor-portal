import { Router } from "express";
import argon2 from "argon2";
import rateLimit from "express-rate-limit";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  accountBalance,
  checkPaymentLedger,
  outstandingCents,
  paymentRequestSchema,
  refundApproveSchema,
  refundNeedsApproval,
  refundRejectSchema,
  refundRequestSchema,
  type PaymentDTO,
  type ReconciliationException,
  type RefundDTO,
} from "@roofdesk/shared";
import { env } from "../../config/env";
import { audit as userAudit } from "../../core/audit";
import { hashToken, newRefreshToken, requireAuth } from "../../core/auth";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { Job } from "../../models/Job";
import { LedgerEntry } from "../../models/LedgerEntry";
import { Payment } from "../../models/Payment";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { Refund } from "../../models/Refund";
import { User } from "../../models/User";
import { executeRefund } from "./service";

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const payParam = jobParam.extend({ paymentId: z.string().refine(isValidObjectId, "Invalid payment id") });
const refundParam = jobParam.extend({ refundId: z.string().refine(isValidObjectId, "Invalid refund id") });

const payUrl = (token: string) => `${env.WEB_ORIGIN}/pay/${token}`;
// Money actions are slow and rare: keep brute-forcing the password re-check expensive.
const moneyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

export const toPaymentDTO = (p: any): PaymentDTO => ({
  id: p.id,
  jobId: String(p.jobId),
  milestoneId: String(p.milestoneId),
  description: p.description,
  amountCents: p.amountCents,
  status: p.status,
  payerName: p.payerName,
  payerEmail: p.payerEmail ?? undefined,
  provider: p.provider ?? env.PAYMENT_PROVIDER,
  failureReason: p.failureReason ?? undefined,
  refundedCents: p.refundedCents,
  disputed: p.disputed,
  flag: p.flag ?? undefined,
  createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString(),
});

export const toRefundDTO = (r: any): RefundDTO => ({
  id: r.id,
  paymentId: String(r.paymentId),
  amountCents: r.amountCents,
  reason: r.reason,
  status: r.status,
  requestedAt: r.createdAt.toISOString(),
  processedAt: r.processedAt?.toISOString(),
  failureReason: r.failureReason ?? undefined,
});

/** Step-up check: moving money needs the password again, so a hijacked session alone cannot do it. */
async function confirmPassword(userId: string, password: string) {
  const u = await User.findById(userId).select("+passwordHash");
  if (!u || !(await argon2.verify(u.passwordHash, password))) throw new AppError(403, "step_up_failed", "That password is not correct");
}

// ---------------------------------------------------------------- per-job payments
export const paymentsRouter = Router({ mergeParams: true });
paymentsRouter.use(requireAuth);

paymentsRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const [payments, refunds, ledger] = await Promise.all([
      Payment.find({ jobId: req.params.jobId }).sort({ createdAt: -1 }),
      Refund.find({ jobId: req.params.jobId }).sort({ createdAt: -1 }),
      LedgerEntry.find({ jobId: req.params.jobId }),
    ]);
    const lines = ledger.map((l) => ({ account: l.account as any, direction: l.direction as any, amountCents: l.amountCents }));
    res.json({
      provider: env.PAYMENT_PROVIDER,
      payments: payments.map(toPaymentDTO),
      refunds: refunds.map(toRefundDTO),
      collectedCents: accountBalance(lines, "cash"),
    });
  }),
);

paymentsRouter.post(
  "/",
  requirePermission("payment:request"),
  validate({ params: jobParam, body: paymentRequestSchema }),
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.body.milestoneId)) throw new AppError(422, "invalid_payment", "Choose a payment");
    const [job, m] = await Promise.all([Job.findById(req.params.jobId), PaymentMilestone.findOne({ _id: req.body.milestoneId, jobId: req.params.jobId })]);
    if (!job) throw notFound("Job");
    if (!m) throw notFound("Payment");
    // The gate from Step 7: a payment can only be billed after it was marked ready (waivers in, or knowingly overridden).
    if (m.status !== "ready") {
      throw new AppError(409, "not_ready", m.status === "paid" ? "This payment is already paid in full" : "Mark this payment ready first. That confirms the lien waivers are in.");
    }
    const existing = await Payment.find({ milestoneId: m._id });
    const owed = outstandingCents(m.expectedAmountCents, existing.map((p) => ({ status: p.status, amountCents: p.amountCents, refundedCents: p.refundedCents })));
    if (owed <= 0) throw new AppError(409, "nothing_owed", "Everything for this payment has been paid or already requested");
    const amountCents = req.body.amountCents ?? owed;
    if (amountCents > owed) throw new AppError(422, "too_much", `Only ${(owed / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} is still owed on this payment`);

    const token = newRefreshToken();
    const p = await Payment.create({
      jobId: job._id,
      milestoneId: m._id,
      description: `${m.label} for ${job.property.line1}`,
      amountCents,
      payerName: req.body.payerName,
      payerEmail: req.body.payerEmail || undefined,
      provider: env.PAYMENT_PROVIDER,
      tokenHash: hashToken(token),
      requestedBy: req.auth!.userId,
    });
    await userAudit(req, "payment.requested", "Payment", p._id, { amountCents });
    res.status(201).json({ payment: toPaymentDTO(p), payUrl: payUrl(token) });
  }),
);

paymentsRouter.post(
  "/:paymentId/resend",
  requirePermission("payment:request"),
  validate({ params: payParam }),
  asyncHandler(async (req, res) => {
    const p = await Payment.findOne({ _id: req.params.paymentId, jobId: req.params.jobId });
    if (!p) throw notFound("Payment");
    if (!["requested", "pending", "failed"].includes(p.status)) throw new AppError(409, "payment_closed", `This payment is ${p.status}`);
    const token = newRefreshToken();
    p.tokenHash = hashToken(token);
    await p.save();
    await userAudit(req, "payment.link_reissued", "Payment", p._id);
    res.json({ payment: toPaymentDTO(p), payUrl: payUrl(token) });
  }),
);

paymentsRouter.post(
  "/:paymentId/cancel",
  requirePermission("payment:request"),
  validate({ params: payParam }),
  asyncHandler(async (req, res) => {
    const p = await Payment.findOne({ _id: req.params.paymentId, jobId: req.params.jobId });
    if (!p) throw notFound("Payment");
    // A payment the gateway is already processing cannot be withdrawn from here.
    if (!["requested", "failed"].includes(p.status)) throw new AppError(409, "cannot_cancel", `A ${p.status} payment cannot be canceled`);
    p.status = "canceled";
    p.tokenHash = undefined;
    await p.save();
    await userAudit(req, "payment.canceled", "Payment", p._id);
    res.json({ payment: toPaymentDTO(p) });
  }),
);

paymentsRouter.post(
  "/:paymentId/refunds",
  moneyLimiter,
  requirePermission("payment:refund"),
  validate({ params: payParam, body: refundRequestSchema }),
  asyncHandler(async (req, res) => {
    await confirmPassword(req.auth!.userId, req.body.password);
    const p = await Payment.findOne({ _id: req.params.paymentId, jobId: req.params.jobId });
    if (!p) throw notFound("Payment");
    if (!["succeeded", "partially_refunded"].includes(p.status)) throw new AppError(409, "not_refundable", "Only paid payments can be refunded");

    // Refunds waiting for approval already claim part of the money.
    const pending = await Refund.find({ paymentId: p._id, status: { $in: ["pending_approval", "processing"] } });
    const available = p.amountCents - p.refundedCents - pending.reduce((n, r) => n + r.amountCents, 0);
    if (req.body.amountCents > available) throw new AppError(422, "too_much", `At most ${(available / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} can still be refunded`);

    const company = await Company.findById(req.auth!.companyId);
    const needsApproval = refundNeedsApproval(req.body.amountCents, company?.settings?.refundApprovalThresholdCents ?? 100000);
    const refund = await Refund.create({ paymentId: p._id, jobId: p.jobId, amountCents: req.body.amountCents, reason: req.body.reason, requestedBy: req.auth!.userId, status: "pending_approval" });
    await userAudit(req, "refund.requested", "Refund", refund._id, { amountCents: refund.amountCents, needsApproval });

    if (needsApproval) return res.status(202).json({ refund: toRefundDTO(refund), needsApproval: true });
    const out = await executeRefund(refund.id);
    const fresh = (await Refund.findById(refund.id))!;
    if (!out.ok) return res.status(502).json({ error: { code: "refund_failed", message: out.error ?? "The refund failed" } });
    res.status(201).json({ refund: toRefundDTO(fresh), needsApproval: false });
  }),
);

paymentsRouter.post(
  "/refunds/:refundId/approve",
  moneyLimiter,
  requirePermission("payment:approve"),
  validate({ params: refundParam, body: refundApproveSchema }),
  asyncHandler(async (req, res) => {
    await confirmPassword(req.auth!.userId, req.body.password);
    const r = await Refund.findOne({ _id: req.params.refundId, jobId: req.params.jobId });
    if (!r) throw notFound("Refund");
    if (r.status !== "pending_approval") throw new AppError(409, "not_pending", `This refund is ${r.status}`);
    if (String(r.requestedBy) === req.auth!.userId) throw new AppError(403, "same_person", "A different person must approve this refund");
    r.approvedBy = req.auth!.userId as any;
    await r.save();
    await userAudit(req, "refund.approved", "Refund", r._id);
    const out = await executeRefund(r.id);
    if (!out.ok) return res.status(502).json({ error: { code: "refund_failed", message: out.error ?? "The refund failed" } });
    res.json({ refund: toRefundDTO((await Refund.findById(r.id))!) });
  }),
);

paymentsRouter.post(
  "/refunds/:refundId/reject",
  requirePermission("payment:approve"),
  validate({ params: refundParam, body: refundRejectSchema }),
  asyncHandler(async (req, res) => {
    const r = await Refund.findOne({ _id: req.params.refundId, jobId: req.params.jobId });
    if (!r) throw notFound("Refund");
    if (r.status !== "pending_approval") throw new AppError(409, "not_pending", `This refund is ${r.status}`);
    r.status = "rejected";
    r.failureReason = req.body.reason;
    await r.save();
    await userAudit(req, "refund.rejected", "Refund", r._id, { reason: req.body.reason });
    res.json({ refund: toRefundDTO(r) });
  }),
);

// ---------------------------------------------------------------- company-wide view
export const companyPaymentsRouter = Router();
companyPaymentsRouter.use(requireAuth);

companyPaymentsRouter.get(
  "/",
  requirePermission("job:read"),
  asyncHandler(async (_req, res) => {
    const [payments, pendingRefunds, ledger] = await Promise.all([
      Payment.find().sort({ createdAt: -1 }).limit(100),
      Refund.find({ status: "pending_approval" }).sort({ createdAt: -1 }),
      LedgerEntry.find(),
    ]);
    const jobs = await Job.find({ _id: { $in: [...new Set(payments.map((p) => String(p.jobId)))] } });
    const byJob = new Map(jobs.map((j) => [j.id, { jobNumber: j.jobNumber, customer: j.customer.name }]));
    res.json({
      provider: env.PAYMENT_PROVIDER,
      payments: payments.map((p) => ({ ...toPaymentDTO(p), job: byJob.get(String(p.jobId)) })),
      pendingRefunds: pendingRefunds.map(toRefundDTO),
      collectedCents: accountBalance(ledger.map((l) => ({ account: l.account as any, direction: l.direction as any, amountCents: l.amountCents })), "cash"),
    });
  }),
);

/**
 * Internal reconciliation: does the ledger agree with every payment record, are any refunds stuck, are
 * any payments flagged or stalled? Comparing against the gateway's own balance report is a later step.
 */
companyPaymentsRouter.get(
  "/reconciliation",
  requirePermission("payment:approve"),
  asyncHandler(async (_req, res) => {
    const [payments, ledger, stuck] = await Promise.all([
      Payment.find(),
      LedgerEntry.find(),
      Refund.find({ status: "processing", updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }),
    ]);
    const exceptions: ReconciliationException[] = [];
    for (const p of payments) {
      const lines = ledger.filter((l) => String(l.paymentId) === p.id).map((l) => ({ account: l.account as any, direction: l.direction as any, amountCents: l.amountCents, group: l.group }));
      for (const message of checkPaymentLedger({ status: p.status, amountCents: p.amountCents, refundedCents: p.refundedCents, flag: p.flag ?? undefined }, lines)) {
        exceptions.push({ paymentId: p.id, jobId: String(p.jobId), kind: "ledger", message });
      }
      if (p.status === "pending" && p.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
        exceptions.push({ paymentId: p.id, jobId: String(p.jobId), kind: "stalled", message: "Still processing after 7 days" });
      }
      if (p.disputed) exceptions.push({ paymentId: p.id, jobId: String(p.jobId), kind: "dispute", message: "A dispute is open on this payment" });
    }
    for (const r of stuck) exceptions.push({ paymentId: String(r.paymentId), jobId: String(r.jobId), kind: "refund_stuck", message: "A refund has been processing for over 10 minutes. Check the gateway before retrying." });
    res.json({ checkedPayments: payments.length, exceptions });
  }),
);
