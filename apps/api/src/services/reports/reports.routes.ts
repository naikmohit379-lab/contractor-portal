import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import {
  JOB_STAGES,
  PAYMENT_STATUS_LABELS,
  STAGE_LABELS,
  agingBuckets,
  approvalStats,
  averageCycleDays,
  claimCycleDays,
  lastMonths,
  monthlyTotals,
  openRequestedCents,
  receivablesSummary,
  toCsv,
  totalNetCollected,
} from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Claim } from "../../models/Claim";
import { Estimate } from "../../models/Estimate";
import { Job } from "../../models/Job";
import { LedgerEntry } from "../../models/LedgerEntry";
import { Party } from "../../models/Party";
import { Payment } from "../../models/Payment";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { Supplier } from "../../models/Supplier";
import { Waiver } from "../../models/Waiver";
import { Company } from "../../models/Company";
import { notFound } from "../../core/errors";
import { toVersionDTO } from "../estimates/estimates.routes";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requirePermission("report:view"));

/** Everything the owner dashboard shows, in one call. Money is cents. */
reportsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const months = lastMonths(6, now);
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const [stageRows, claims, estimates, openWaivers, milestones, payments, cash] = await Promise.all([
      Job.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]) as Promise<{ _id: string; count: number }[]>,
      Claim.find(),
      Estimate.find(),
      Waiver.find({ status: { $in: ["requested", "viewed"] } }),
      PaymentMilestone.find(),
      Payment.find(),
      LedgerEntry.find({ account: "cash", at: { $gte: since } }),
    ]);

    // Pipeline
    const byStage = Object.fromEntries(JOB_STAGES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of stageRows) byStage[r._id] = r.count;

    // Claims: "requested" is the replacement cost value of the original estimate version.
    const rcvByJob = new Map(estimates.map((e) => [String(e.jobId), toVersionDTO(e.versions[0]).totals.rcvCents]));
    const claimRows = claims.map((c) => ({ status: c.status, requestedCents: rcvByJob.get(String(c.jobId)) ?? 0, approvedCents: c.approvedAmountCents }));
    const claimsByStatus: Record<string, number> = {};
    for (const c of claims) claimsByStatus[c.status] = (claimsByStatus[c.status] ?? 0) + 1;

    // Waiver aging (anything not answered, including links that have lapsed)
    const parties = await Party.find({ _id: { $in: openWaivers.map((w) => w.partyId) } });
    const jobs = await Job.find({ _id: { $in: openWaivers.map((w) => w.jobId) } });
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const jobInfo = new Map(jobs.map((j) => [j.id, j.jobNumber]));
    const oldest = [...openWaivers]
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
      .slice(0, 5)
      .map((w) => ({ waiverId: w.id, jobId: String(w.jobId), jobNumber: jobInfo.get(String(w.jobId)) ?? "", partyName: partyName.get(String(w.partyId)) ?? "", requestedAt: w.requestedAt.toISOString() }));

    // Receivables
    const byMilestone = new Map<string, typeof payments>();
    for (const p of payments) byMilestone.set(String(p.milestoneId), [...(byMilestone.get(String(p.milestoneId)) ?? []), p]);
    const money = milestones.map((m) => {
      const ps = (byMilestone.get(m.id) ?? []).map((p) => ({ status: p.status, amountCents: p.amountCents, refundedCents: p.refundedCents }));
      return { expectedCents: m.expectedAmountCents, status: m.status, dueDate: m.dueDate, netCollectedCents: totalNetCollected(ps), openRequestedCents: openRequestedCents(ps) };
    });

    const collected = monthlyTotals(cash.map((l) => ({ at: l.at, deltaCents: l.direction === "debit" ? l.amountCents : -l.amountCents })), months);

    res.json({
      generatedAt: now.toISOString(),
      pipeline: { byStage, total: stageRows.reduce((n, r) => n + r.count, 0) },
      claims: {
        total: claims.length,
        byStatus: claimsByStatus,
        approval: approvalStats(claimRows),
        avgCycleDays: averageCycleDays(claims.map((c) => claimCycleDays(c.statusHistory.map((h) => ({ to: String(h.to), at: h.at!}))))),
      },
      waivers: { open: openWaivers.length, aging: agingBuckets(openWaivers.map((w) => ({ requestedAt: w.requestedAt })), now), oldest },
      receivables: receivablesSummary(money, now),
      collectedByMonth: collected,
    });
  }),
);

const kind = z.object({ kind: z.enum(["jobs", "payments", "waivers", "ledger"]) });

reportsRouter.get(
  "/price-variance",
  asyncHandler(async (_req, res) => {
    const orders = await PurchaseOrder.find({ "supplierInvoice.documentId": { $exists: true } }).sort({ "supplierInvoice.receivedAt": -1 });
    const [jobs, suppliers] = await Promise.all([
      Job.find({ _id: { $in: orders.map((o) => o.jobId) } }).select("jobNumber customer property"),
      Supplier.find({ _id: { $in: orders.map((o) => o.supplierId) } }).select("name"),
    ]);
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
    const items = orders.map((order) => {
      const expectedTotalCents = order.lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unitPriceCents ?? 0), 0);
      const invoice = order.supplierInvoice!;
      const varianceCents = invoice.totalCents! - expectedTotalCents;
      const job = jobMap.get(String(order.jobId));
      return {
        orderId: order.id,
        jobId: String(order.jobId),
        jobNumber: job?.jobNumber ?? "",
        customer: job?.customer?.name ?? "",
        supplierName: supplierMap.get(String(order.supplierId)) ?? "Unknown supplier",
        poNumber: order.poNumber,
        invoiceNumber: invoice.invoiceNumber,
        documentId: String(invoice.documentId),
        receivedAt: invoice.receivedAt?.toISOString() ?? "",
        expectedTotalCents,
        invoiceTotalCents: invoice.totalCents!,
        varianceCents: expectedTotalCents > 0 ? varianceCents : null,
        variancePct: expectedTotalCents > 0 ? Math.round((varianceCents / expectedTotalCents) * 10000) / 100 : null,
      };
    });
    res.json({ items, totals: { expectedCents: items.reduce((n, item) => n + item.expectedTotalCents, 0), invoiceCents: items.reduce((n, item) => n + item.invoiceTotalCents, 0), varianceCents: items.reduce((n, item) => n + (item.varianceCents ?? 0), 0) } });
  }),
);

/**
 * CSV exports for spreadsheets and accountants. Built in memory, which is fine at this size; a background
 * job takes over if exports grow large. Text cells are protected against spreadsheet formula injection.
 */
reportsRouter.get(
  "/export/:kind.csv",
  validate({ params: kind }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country settings.currency");
    const currency = company?.settings?.currency ?? (company?.settings?.country === "IN" ? "INR" : "USD");
    const iso = (d?: Date | null) => (d ? d.toISOString() : "");
    let rows: (string | number | null)[][] = [];

    if (req.params.kind === "jobs") {
      const jobs = await Job.find().sort({ createdAt: -1 });
      rows = [["Job number", "Customer", "Address", "City / town", "State / Union Territory", "ZIP code", "Type", "Stage", "Created", "Address line 2", "Locality", "District", "PIN code", "Country"], ...jobs.map((j) => [j.jobNumber, j.customer?.name ?? "", j.property?.line1 ?? "", j.property?.city ?? "", j.property?.state ?? "", j.property?.zip ?? "", j.type, STAGE_LABELS[j.stage as keyof typeof STAGE_LABELS], iso((j as any).createdAt), j.property?.line2 ?? "", j.property?.locality ?? "", j.property?.district ?? "", j.property?.pinCode ?? "", j.property?.country ?? "US"])];
    } else if (req.params.kind === "payments") {
      const [ps, js] = await Promise.all([Payment.find().sort({ createdAt: -1 }), Job.find()]);
      const num = new Map(js.map((j) => [j.id, j.jobNumber]));
      rows = [["Job number", "Description", "Payer", "Amount", "Refunded", "Currency code", "Status", "Requested", "Paid"], ...ps.map((p) => [num.get(String(p.jobId)) ?? "", p.description, p.payerName, p.amountCents / 100, p.refundedCents / 100, currency, PAYMENT_STATUS_LABELS[p.status as keyof typeof PAYMENT_STATUS_LABELS], iso((p as any).createdAt), iso(p.paidAt)])];
    } else if (req.params.kind === "waivers") {
      if (company?.settings?.country === "IN") throw notFound("Report");
      const [ws, ps, js] = await Promise.all([Waiver.find().sort({ createdAt: -1 }), Party.find(), Job.find()]);
      const party = new Map(ps.map((p) => [p.id, p.name]));
      const num = new Map(js.map((j) => [j.id, j.jobNumber]));
      rows = [["Job number", "Party", "Type", "Amount", "Currency code", "Through date", "Status", "Requested", "Signed", "Signer", "Fingerprint"], ...ws.map((w) => [num.get(String(w.jobId)) ?? "", party.get(String(w.partyId)) ?? "", w.type, w.amountCents / 100, currency, iso(w.throughDate).slice(0, 10), w.status, iso(w.requestedAt), iso(w.signedAt), w.signerName ?? "", w.documentHash ?? ""])];
    } else {
      const ls = await LedgerEntry.find().sort({ at: 1 });
      rows = [["Date", "Group", "Kind", "Account", "Direction", "Amount", "Currency code", "Memo", "Payment id"], ...ls.map((l) => [iso(l.at), l.group, l.kind, l.account, l.direction, l.amountCents / 100, currency, l.memo ?? "", String(l.paymentId)])];
    }

    await audit(req, "report.exported", "Report", new Types.ObjectId(req.auth!.companyId), { kind: req.params.kind, rows: rows.length - 1 });
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="roofdesk-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send("\uFEFF" + toCsv(rows)); // BOM so Excel opens it as UTF-8
  }),
);
