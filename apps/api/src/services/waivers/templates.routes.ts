import { Router } from "express";
import { z } from "zod";
import { WAIVER_TYPES, templateUpdateSchema, type TemplateDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { WaiverTemplate } from "../../models/WaiverTemplate";
import { Company } from "../../models/Company";
import { ensureTemplates } from "./templates";

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

const typeParam = z.object({ type: z.enum(WAIVER_TYPES) });
const toDTO = (t: any): TemplateDTO => ({ type: t.type, version: t.version, body: t.body, legalApproved: t.legalApproved, approvedAt: t.approvedAt?.toISOString() });

templatesRouter.get(
  "/",
  requirePermission("job:read"),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country");
    if (company?.settings?.country === "IN") return res.json({ items: [] });
    const items = await ensureTemplates();
    res.json({ items: WAIVER_TYPES.map((ty) => items.find((t) => t.type === ty)).filter(Boolean).map(toDTO) });
  }),
);

// Editing never changes wording already sent: it creates a new version that must be approved before use.
templatesRouter.put(
  "/:type",
  requirePermission("user:manage"),
  validate({ params: typeParam, body: templateUpdateSchema }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country");
    if (company?.settings?.country === "IN") throw notFound("Template");
    await ensureTemplates();
    const current = await WaiverTemplate.findOne({ type: req.params.type, state: "*", active: true });
    if (!current) throw notFound("Template");
    current.active = false;
    await current.save();
    const next = await WaiverTemplate.create({ type: current.type, state: "*", version: current.version + 1, body: req.body.body });
    await audit(req, "waiver_template.edited", "WaiverTemplate", next._id, { type: next.type, version: next.version });
    res.json(toDTO(next));
  }),
);

templatesRouter.post(
  "/:type/approve",
  requirePermission("user:manage"),
  validate({ params: typeParam }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country");
    if (company?.settings?.country === "IN") throw notFound("Template");
    await ensureTemplates();
    const t = await WaiverTemplate.findOne({ type: req.params.type, state: "*", active: true });
    if (!t) throw notFound("Template");
    t.legalApproved = true;
    t.approvedBy = req.auth!.userId as any;
    t.approvedAt = new Date();
    await t.save();
    await audit(req, "waiver_template.approved", "WaiverTemplate", t._id, { type: t.type, version: t.version });
    res.json(toDTO(t));
  }),
);
