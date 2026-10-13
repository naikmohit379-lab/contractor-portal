import { Router } from "express";
import rateLimit from "express-rate-limit";
import { supplierConfirmSchema } from "@roofdesk/shared";
import { hashToken } from "../../core/auth";
import { notify, touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, validate } from "../../core/http";
import { AuditLog } from "../../models/AuditLog";
import { Company } from "../../models/Company";
import { Job } from "../../models/Job";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { Supplier } from "../../models/Supplier";

/** Link-based supplier confirmation. No login: the secret in the URL is the credential, so it is hashed at rest and rate limited. */
export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));

async function loadByToken(token: string) {
  const po = await PurchaseOrder.findOne({ confirmTokenHash: hashToken(token) }).setOptions({ skipTenant: true });
  if (!po) throw notFound("Order link");
  return po;
}

publicRouter.get(
  "/orders/:token",
  asyncHandler(async (req, res) => {
    const po = await loadByToken(req.params.token!);
    const companyId = String((po as any).companyId);
    const [company, supplier, job] = await Promise.all([
      Company.findById(companyId),
      Supplier.findById(po.supplierId).setOptions({ skipTenant: true }),
      Job.findById(po.jobId).setOptions({ skipTenant: true }),
    ]);
    res.json({
      poNumber: po.poNumber,
      status: po.status,
      company: company?.name,
      supplier: supplier?.name,
      accountNumber: supplier?.accountNumber ?? undefined,
      deliverTo: job?.property ? `${job.property.line1}, ${job.property.city}, ${job.property.state} ${job.property.zip}` : undefined,
      dropInstructions: po.dropInstructions ?? undefined,
      requestedWindow: po.deliveryWindow?.date ? { date: po.deliveryWindow.date.toISOString(), slot: po.deliveryWindow.slot } : undefined,
      lines: po.lines.map((l) => ({ description: l.description, unit: l.unit, quantity: l.quantity, sku: l.sku ?? undefined })),
    });
  }),
);

publicRouter.post(
  "/orders/:token/respond",
  validate({ body: supplierConfirmSchema }),
  asyncHandler(async (req, res) => {
    const po = await loadByToken(req.params.token!);
    const companyId = String((po as any).companyId);
    if (po.status !== "sent") throw new AppError(409, "already_responded", "This order has already been answered");

    const { action, deliveryWindow, note } = req.body;
    if (action === "backorder") {
      po.statusHistory.push({ from: po.status, to: "backordered", note, by: "supplier" } as any);
      po.status = "backordered";
    } else {
      po.statusHistory.push({ from: po.status, to: "confirmed", note, by: "supplier" } as any);
      po.status = "confirmed";
      if (deliveryWindow) {
        po.set("deliveryWindow", { date: new Date(deliveryWindow.date), slot: deliveryWindow.slot });
        po.statusHistory.push({ from: "confirmed", to: "scheduled", by: "supplier" } as any);
        po.status = "scheduled";
      }
    }
    await po.save();
    await AuditLog.create({ companyId, action: "order.supplier_responded", entity: "PurchaseOrder", entityId: po._id, meta: { action }, ip: req.ip });
    touchJob(companyId, po.jobId, "orders");
    const supplier = await Supplier.findById(po.supplierId).setOptions({ skipTenant: true });
    await notify(companyId, {
      kind: action === "backorder" ? "order.backordered" : "order.confirmed",
      title: action === "backorder" ? `${supplier?.name ?? "Supplier"} backordered ${po.poNumber}` : `${supplier?.name ?? "Supplier"} confirmed ${po.poNumber}`,
      body: po.deliveryWindow?.date ? `Delivery set for ${po.deliveryWindow.date.toDateString()}.` : action === "backorder" ? "Some items are backordered. Check the order." : "The supplier confirmed the order.",
      href: `/jobs/${po.jobId}?tab=orders`,
      roles: ["owner", "admin", "pm"],
    });
    res.json({ status: po.status });
  }),
);
