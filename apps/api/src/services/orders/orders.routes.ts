import { createHash, randomBytes } from "node:crypto";
import express, { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { buildMaterialList } from "@roofdesk/estimate-engine";
import {
  PO_STATUS_LABELS,
  canTransitionPO,
  poCreateSchema,
  poStatusSchema,
  poUpdateSchema,
  MAX_UPLOAD_BYTES,
  type PurchaseOrderDTO,
} from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { hashToken, newRefreshToken, requireAuth } from "../../core/auth";
import { sendLinkEmail } from "../../core/mailer";
import { touchJob } from "../../core/notify";
import { env } from "../../config/env";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Estimate } from "../../models/Estimate";
import { Job } from "../../models/Job";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { Supplier } from "../../models/Supplier";
import { Document } from "../../models/Document";
import { cleanFilename, detectFileType } from "../documents/fileType";
import { newStorageKey } from "../documents/storage";
import { getStorage } from "../documents/storageFactory";
import { toVersionDTO } from "../estimates/estimates.routes";
import { advanceStage } from "../jobs/stages";

export const ordersRouter = Router({ mergeParams: true });
ordersRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const orderParam = jobParam.extend({ orderId: z.string().refine(isValidObjectId, "Invalid order id") });

export function toPODTO(po: any, supplierName: string): PurchaseOrderDTO {
  const lines = po.lines.map((l: any) => ({
    key: l.key,
    description: l.description,
    unit: l.unit,
    quantity: l.quantity,
    sku: l.sku ?? undefined,
    unitPriceCents: l.unitPriceCents ?? undefined,
  }));
  const expectedTotalCents = lines.reduce((n: number, l: any) => n + l.quantity * (l.unitPriceCents ?? 0), 0);
  const supplierInvoice = po.supplierInvoice?.documentId ? {
    invoiceNumber: po.supplierInvoice.invoiceNumber,
    totalCents: po.supplierInvoice.totalCents,
    documentId: String(po.supplierInvoice.documentId),
    receivedAt: po.supplierInvoice.receivedAt.toISOString(),
    expectedTotalCents,
    varianceCents: expectedTotalCents > 0 ? po.supplierInvoice.totalCents - expectedTotalCents : null,
    variancePct: expectedTotalCents > 0 ? Math.round(((po.supplierInvoice.totalCents - expectedTotalCents) / expectedTotalCents) * 10000) / 100 : null,
  } : undefined;
  return {
    id: po.id,
    poNumber: po.poNumber,
    jobId: String(po.jobId),
    supplierId: String(po.supplierId),
    supplierName,
    status: po.status,
    lines,
    deliveryWindow: po.deliveryWindow?.date ? { date: po.deliveryWindow.date.toISOString(), slot: po.deliveryWindow.slot } : undefined,
    dropInstructions: po.dropInstructions ?? undefined,
    supplierInvoice,
    statusHistory: po.statusHistory.map((h: any) => ({ from: h.from, to: h.to, at: h.at.toISOString(), note: h.note, by: h.by })),
    totalCents: expectedTotalCents,
    createdAt: po.createdAt.toISOString(),
  };
}

/** Material list from the job's current estimate version, priced from the supplier's catalog when one is chosen. */
async function materialLines(jobId: string, supplierId?: string) {
  const est = await Estimate.findOne({ jobId });
  const current = est?.versions.find((v) => v.versionNo === est.currentVersion);
  if (!est || !current) throw new AppError(422, "estimate_required", "Build an estimate first. The material list comes from it.");
  const supplier = supplierId ? await Supplier.findById(supplierId) : null;
  const catalog = new Map((supplier?.catalog ?? []).map((c) => [c.materialKey, c]));
  return buildMaterialList(toVersionDTO(current).lineItems).map((m) => {
    const c = catalog.get(m.key);
    return { ...m, sku: c?.sku ?? undefined, unitPriceCents: c?.unitPriceCents ?? undefined };
  });
}

async function supplierNames(ids: unknown[]) {
  const rows = await Supplier.find({ _id: { $in: ids } });
  return new Map(rows.map((s) => [s.id, s.name]));
}

ordersRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const orders = await PurchaseOrder.find({ jobId: req.params.jobId }).sort({ createdAt: -1 });
    const names = await supplierNames(orders.map((o) => o.supplierId));
    res.json({ items: orders.map((o) => toPODTO(o, names.get(String(o.supplierId)) ?? "Unknown supplier")) });
  }),
);

ordersRouter.get(
  "/material-list",
  requirePermission("job:read"),
  validate({ params: jobParam, query: z.object({ supplierId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const supplierId = (req.query as { supplierId?: string }).supplierId;
    res.json({ lines: await materialLines(req.params.jobId!, supplierId && isValidObjectId(supplierId) ? supplierId : undefined) });
  }),
);

ordersRouter.post(
  "/",
  requirePermission("order:send"),
  validate({ params: jobParam, body: poCreateSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    if (!isValidObjectId(req.body.supplierId)) throw new AppError(422, "invalid_supplier", "Choose a supplier");
    const supplier = await Supplier.findById(req.body.supplierId);
    if (!supplier) throw notFound("Supplier");

    const lines = req.body.lines ?? (await materialLines(job.id, supplier.id));
    if (lines.length === 0) throw new AppError(422, "no_lines", "Add at least one material line");

    const { deliveryWindow, ...rest } = req.body;
    const po = await PurchaseOrder.create({
      ...rest,
      lines,
      deliveryWindow: deliveryWindow ? { date: new Date(deliveryWindow.date), slot: deliveryWindow.slot } : undefined,
      jobId: job._id,
      supplierId: supplier._id,
      poNumber: `PO-${randomBytes(3).toString("hex").toUpperCase()}`,
      statusHistory: [{ to: "draft", by: req.auth!.userId }],
      createdBy: req.auth!.userId,
    });
    await audit(req, "order.created", "PurchaseOrder", po._id, { poNumber: po.poNumber });
    touchJob(req.auth!.companyId, job.id, "orders");
    res.status(201).json(toPODTO(po, supplier.name));
  }),
);

ordersRouter.patch(
  "/:orderId",
  requirePermission("order:send"),
  validate({ params: orderParam, body: poUpdateSchema }),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findOne({ _id: req.params.orderId, jobId: req.params.jobId });
    if (!po) throw notFound("Order");
    if (po.status !== "draft") throw new AppError(409, "order_locked", "Only draft orders can be edited");
    const { deliveryWindow, lines, dropInstructions } = req.body;
    if (lines) po.set("lines", lines);
    if (deliveryWindow) po.set("deliveryWindow", { date: new Date(deliveryWindow.date), slot: deliveryWindow.slot });
    if (dropInstructions !== undefined) po.dropInstructions = dropInstructions;
    await po.save();
    const names = await supplierNames([po.supplierId]);
    res.json(toPODTO(po, names.get(String(po.supplierId)) ?? "Unknown supplier"));
  }),
);

ordersRouter.post(
  "/:orderId/invoice",
  requirePermission("order:send"),
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  validate({ params: orderParam }),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findOne({ _id: req.params.orderId, jobId: req.params.jobId });
    if (!po) throw notFound("Order");
    if (po.supplierInvoice?.documentId) throw new AppError(409, "invoice_exists", "An invoice is already recorded for this purchase order");
    let rawInvoiceNumber = req.header("x-invoice-number") ?? "";
    try { rawInvoiceNumber = decodeURIComponent(rawInvoiceNumber); } catch { /* validation below rejects malformed input */ }
    const invoiceNumber = z.string().trim().min(1).max(80).safeParse(rawInvoiceNumber);
    const totalCents = z.coerce.number().int().positive().max(100_000_000).safeParse(req.header("x-invoice-total-cents"));
    if (!invoiceNumber.success || !totalCents.success) throw new AppError(422, "invalid_invoice", "Enter an invoice number and a positive invoice total");
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError(422, "empty_file", "Choose a PDF invoice to upload");
    const type = detectFileType(body);
    if (!type || type.contentType !== "application/pdf") throw new AppError(415, "unsupported_type", "Supplier invoices must be PDF files");

    const key = newStorageKey(req.auth!.companyId, String(po.jobId), type.ext);
    await getStorage().put(key, body, type.contentType);
    let doc: any;
    try {
      doc = await Document.create({
        jobId: po.jobId,
        kind: "document",
        filename: cleanFilename(req.header("x-file-name")),
        contentType: type.contentType,
        sizeBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        storageKey: key,
        includeInPacket: false,
        uploadedBy: req.auth!.userId,
      });
      po.set("supplierInvoice", { invoiceNumber: invoiceNumber.data, totalCents: totalCents.data, documentId: doc._id, receivedAt: new Date(), uploadedBy: req.auth!.userId });
      await po.save();
    } catch (err) {
      if (doc) await Document.deleteOne({ _id: doc._id }).catch(() => undefined);
      await getStorage().delete(key).catch(() => undefined);
      throw err;
    }
    await audit(req, "order.invoice_uploaded", "PurchaseOrder", po._id, { invoiceNumber: invoiceNumber.data, totalCents: totalCents.data, documentId: String(doc._id) });
    touchJob(req.auth!.companyId, po.jobId, "orders");
    const names = await supplierNames([po.supplierId]);
    res.status(201).json(toPODTO(po, names.get(String(po.supplierId)) ?? "Unknown supplier"));
  }),
);

/**
 * Sending creates a one-time confirmation link for the supplier (no account needed).
 * Email delivery arrives with the notification service; for now the sender copies the link.
 */
ordersRouter.post(
  "/:orderId/send",
  requirePermission("order:send"),
  validate({ params: orderParam }),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findOne({ _id: req.params.orderId, jobId: req.params.jobId });
    if (!po) throw notFound("Order");
    if (!canTransitionPO(po.status as any, "sent")) throw new AppError(409, "invalid_transition", "Only draft orders can be sent");
    if (po.lines.length === 0) throw new AppError(422, "no_lines", "Add at least one material line before sending");

    const token = newRefreshToken();
    po.confirmTokenHash = hashToken(token);
    po.statusHistory.push({ from: po.status, to: "sent", by: req.auth!.userId } as any);
    po.status = "sent";
    await po.save();
    await advanceStage(po.jobId, "materials_ordered");
    await audit(req, "order.sent", "PurchaseOrder", po._id, { poNumber: po.poNumber });
    touchJob(req.auth!.companyId, po.jobId, "orders");

    const names = await supplierNames([po.supplierId]);
    const confirmUrl = `${env.WEB_ORIGIN}/confirm/${token}`;
    // If the supplier has an email on file, send the confirmation link straight to them.
    const supplier = await Supplier.findById(po.supplierId);
    const emailedTo = supplier?.contactEmail && (await sendLinkEmail({
      companyId: req.auth!.companyId,
      to: supplier.contactEmail,
      kind: "order.link",
      subject: `Purchase order ${po.poNumber}: please confirm`,
      intro: `Please review purchase order ${po.poNumber} and confirm it, with your delivery window, using the link below.`,
      url: confirmUrl,
    })) ? supplier.contactEmail : undefined;
    res.json({ order: toPODTO(po, names.get(String(po.supplierId)) ?? "Unknown supplier"), confirmUrl, emailedTo });
  }),
);

ordersRouter.post(
  "/:orderId/status",
  requirePermission("order:send"),
  validate({ params: orderParam, body: poStatusSchema }),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findOne({ _id: req.params.orderId, jobId: req.params.jobId });
    if (!po) throw notFound("Order");
    const { status, note } = req.body;
    if (status === "sent") throw new AppError(422, "use_send", "Use Send order to send a draft to the supplier");
    if (!canTransitionPO(po.status as any, status)) {
      throw new AppError(409, "invalid_transition", `An order that is "${PO_STATUS_LABELS[po.status as keyof typeof PO_STATUS_LABELS]}" cannot move to "${PO_STATUS_LABELS[status as keyof typeof PO_STATUS_LABELS]}"`);
    }
    po.statusHistory.push({ from: po.status, to: status, note, by: req.auth!.userId } as any);
    po.status = status;
    await po.save();
    await audit(req, "order.status_changed", "PurchaseOrder", po._id, { to: status });
    touchJob(req.auth!.companyId, po.jobId, "orders");
    const names = await supplierNames([po.supplierId]);
    res.json(toPODTO(po, names.get(String(po.supplierId)) ?? "Unknown supplier"));
  }),
);
