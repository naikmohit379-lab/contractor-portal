import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { catalogSchema, supplierSchema, type SupplierDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Supplier } from "../../models/Supplier";

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

const idParam = z.object({ supplierId: z.string().refine(isValidObjectId, "Invalid supplier id") });

export const toSupplierDTO = (s: any): SupplierDTO => ({
  id: s.id,
  name: s.name,
  accountNumber: s.accountNumber,
  contactName: s.contactName,
  contactEmail: s.contactEmail,
  contactPhone: s.contactPhone,
  branch: s.branch,
  catalog: (s.catalog ?? []).map((c: any) => ({ materialKey: c.materialKey, sku: c.sku, name: c.name, unitPriceCents: c.unitPriceCents })),
});

suppliersRouter.get(
  "/",
  requirePermission("job:read"),
  asyncHandler(async (_req, res) => {
    const items = await Supplier.find().sort({ name: 1 });
    res.json({ items: items.map(toSupplierDTO) });
  }),
);

suppliersRouter.post(
  "/",
  requirePermission("order:send"),
  validate({ body: supplierSchema }),
  asyncHandler(async (req, res) => {
    const s = await Supplier.create(req.body);
    await audit(req, "supplier.created", "Supplier", s._id, { name: s.name });
    res.status(201).json(toSupplierDTO(s));
  }),
);

suppliersRouter.patch(
  "/:supplierId",
  requirePermission("order:send"),
  validate({ params: idParam, body: supplierSchema.partial() }),
  asyncHandler(async (req, res) => {
    const s = await Supplier.findById(req.params.supplierId);
    if (!s) throw notFound("Supplier");
    Object.assign(s, req.body);
    await s.save();
    res.json(toSupplierDTO(s));
  }),
);

/** Replaces the supplier's catalog: maps our material keys (shingles, ridge_cap, ...) to their SKUs and prices. */
suppliersRouter.put(
  "/:supplierId/catalog",
  requirePermission("order:send"),
  validate({ params: idParam, body: catalogSchema }),
  asyncHandler(async (req, res) => {
    const s = await Supplier.findById(req.params.supplierId);
    if (!s) throw notFound("Supplier");
    s.set("catalog", req.body.items);
    await s.save();
    await audit(req, "supplier.catalog_updated", "Supplier", s._id, { items: req.body.items.length });
    res.json(toSupplierDTO(s));
  }),
);
