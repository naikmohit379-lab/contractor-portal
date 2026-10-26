import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { buildRoofReplacementItems, computeTotals, DEFAULT_SETTINGS, diffVersions } from "@roofdesk/estimate-engine";
import { estimateGenerateSchema, estimateHandoffCsv, estimateSaveSchema, newVersionSchema, type EstimateDTO, type EstimateVersionDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Claim } from "../../models/Claim";
import { Estimate } from "../../models/Estimate";
import { Job } from "../../models/Job";
import { MeasurementReport } from "../../models/MeasurementReport";
import { advanceStage } from "../jobs/stages";
import { getActivePriceList, pricesForEstimates } from "../pricing/pricing";

export const estimatesRouter = Router({ mergeParams: true });
estimatesRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const versionParam = jobParam.extend({ versionNo: z.coerce.number().int().min(1) });

const plainItems = (items: any[]) =>
  items.map((i) => ({
    key: i.key,
    description: i.description,
    category: i.category,
    unit: i.unit,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    taxable: i.taxable,
    depreciationPct: i.depreciationPct,
  }));
const plainSettings = (s: any) => ({
  overheadPct: s.overheadPct,
  profitPct: s.profitPct,
  taxPct: s.taxPct,
  deductibleCents: s.deductibleCents,
});

/** Totals are computed on read by the shared engine, never stored, so they cannot drift from the line items. */
export function toVersionDTO(v: any): EstimateVersionDTO {
  const lineItems = plainItems(v.lineItems);
  const settings = plainSettings(v.settings);
  const t = computeTotals(lineItems, settings);
  return {
    versionNo: v.versionNo,
    kind: v.kind,
    lockedAt: v.lockedAt?.toISOString(),
    note: v.note,
    lineItems,
    settings,
    totals: {
      subtotalCents: t.subtotalCents,
      overheadCents: t.overheadCents,
      profitCents: t.profitCents,
      taxCents: t.taxCents,
      rcvCents: t.rcvCents,
      depreciationCents: t.depreciationCents,
      acvCents: t.acvCents,
      netClaimCents: t.netClaimCents,
    },
    createdAt: v.createdAt.toISOString(),
  };
}

export const toEstimateDTO = (e: any): EstimateDTO => ({
  id: e.id,
  jobId: String(e.jobId),
  currentVersion: e.currentVersion,
  versions: e.versions.map(toVersionDTO),
});

const assertUniqueKeys = (items: { key: string }[]) => {
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.key)) throw new AppError(422, "duplicate_line", `Line "${i.key}" appears twice. Each line needs a unique key.`);
    seen.add(i.key);
  }
};

estimatesRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const est = await Estimate.findOne({ jobId: req.params.jobId });
    res.json({ estimate: est ? toEstimateDTO(est) : null });
  }),
);

estimatesRouter.get(
  "/export.csv",
  requirePermission("job:read"),
  validate({ params: jobParam, query: z.object({ versionNo: z.coerce.number().int().min(1).optional() }) }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job || (req.auth!.role === "operations" && !job.assigneeIds.some((id: unknown) => String(id) === req.auth!.userId))) throw notFound("Job");
    const estimate = await Estimate.findOne({ jobId: req.params.jobId });
    if (!estimate) throw notFound("Estimate");
    const versionNo = (req.query as { versionNo?: number }).versionNo ?? estimate.currentVersion;
    const version = estimate.versions.find((entry) => entry.versionNo === versionNo);
    if (!version) throw notFound("Estimate version");

    const lineItems = plainItems(version.lineItems as any);
    const settings = plainSettings(version.settings);
    const totals = computeTotals(lineItems, settings);
    const address = [job.property?.line1, job.property?.city, job.property?.state, job.property?.zip].filter(Boolean).join(", ");
    const csv = estimateHandoffCsv(
      { jobNumber: job.jobNumber, customerName: job.customer?.name ?? "", address },
      toVersionDTO(version),
      totals,
    );
    const filename = `roofdesk-${job.jobNumber}-estimate-v${versionNo}.csv`.replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(`\uFEFF${csv}`);
  }),
);

estimatesRouter.post(
  "/generate",
  requirePermission("estimate:write"),
  validate({ params: jobParam, body: estimateGenerateSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    if (!isValidObjectId(req.body.measurementId)) throw new AppError(422, "invalid_measurement", "Choose a measurement report");

    const m = await MeasurementReport.findOne({ _id: req.body.measurementId, jobId: job._id });
    if (!m || m.status !== "delivered" || !m.totals?.areaSqFt) {
      throw new AppError(422, "measurement_not_ready", "Use a delivered measurement report to start an estimate");
    }
    const prices = await pricesForEstimates();
    const priceVersion = (await getActivePriceList()).doc.version;
    const linear = m.linear ?? { ridge: 0, hip: 0, valley: 0, eave: 0, rake: 0 };
    const lineItems = buildRoofReplacementItems({
      totals: { areaSqFt: m.totals.areaSqFt, squares: m.totals.squares ?? 0, wastePct: m.totals.wastePct ?? 0 },
      linear: { ridge: linear.ridge ?? 0, hip: linear.hip ?? 0, valley: linear.valley ?? 0, eave: linear.eave ?? 0, rake: linear.rake ?? 0 },
      facets: m.facets.map((f) => ({ id: f.id!, areaSqFt: f.areaSqFt!, pitch: f.pitch! })),
    }, prices);
    const claim = await Claim.findOne({ jobId: job._id });
    const est = await Estimate.create({
      jobId: job._id,
      currentVersion: 1,
      versions: [
        {
          versionNo: 1,
          kind: "original",
          lineItems,
          settings: { ...DEFAULT_SETTINGS, deductibleCents: claim?.deductibleCents ?? 0 },
          note: `Generated from the aerial measurement report, using price list version ${priceVersion}`,
          createdBy: req.auth!.userId,
        },
      ],
    });
    await advanceStage(job._id, "estimated");
    await audit(req, "estimate.generated", "Estimate", est._id, { measurementId: m.id });
    touchJob(req.auth!.companyId, job.id, "estimate");
    res.status(201).json({ estimate: toEstimateDTO(est) });
  }),
);

estimatesRouter.put(
  "/versions/:versionNo",
  requirePermission("estimate:write"),
  validate({ params: versionParam, body: estimateSaveSchema }),
  asyncHandler(async (req, res) => {
    const est = await Estimate.findOne({ jobId: req.params.jobId });
    if (!est) throw notFound("Estimate");
    const v = est.versions.find((x) => x.versionNo === Number(req.params.versionNo));
    if (!v) throw notFound("Estimate version");
    if (v.lockedAt) {
      throw new AppError(409, "version_locked", "This version is locked. Create a supplement version to change the scope.");
    }
    assertUniqueKeys(req.body.lineItems);
    v.set("lineItems", req.body.lineItems);
    v.set("settings", req.body.settings);
    if (req.body.note !== undefined) v.note = req.body.note;
    await est.save();
    await audit(req, "estimate.saved", "Estimate", est._id, { versionNo: v.versionNo });
    touchJob(req.auth!.companyId, req.params.jobId, "estimate");
    res.json({ estimate: toEstimateDTO(est) });
  }),
);

estimatesRouter.post(
  "/versions",
  requirePermission("estimate:write"),
  validate({ params: jobParam, body: newVersionSchema }),
  asyncHandler(async (req, res) => {
    const est = await Estimate.findOne({ jobId: req.params.jobId });
    if (!est) throw notFound("Estimate");
    const base = est.versions.find((x) => x.versionNo === (req.body.fromVersion ?? est.currentVersion));
    if (!base) throw notFound("Estimate version");

    const versionNo = Math.max(...est.versions.map((x) => x.versionNo)) + 1;
    const snapshot = { lineItems: plainItems(base.lineItems as any), settings: plainSettings(base.settings) };
    est.versions.forEach((x) => (x.lockedAt ??= new Date())); // earlier versions become immutable history
    est.versions.push({
      versionNo,
      kind: req.body.kind,
      note: req.body.note,
      ...snapshot,
      createdBy: req.auth!.userId,
    } as any);
    est.currentVersion = versionNo;
    await est.save();
    await audit(req, "estimate.version_created", "Estimate", est._id, { versionNo, kind: req.body.kind });
    touchJob(req.auth!.companyId, req.params.jobId, "estimate");
    res.status(201).json({ estimate: toEstimateDTO(est) });
  }),
);

estimatesRouter.get(
  "/diff",
  requirePermission("job:read"),
  validate({ params: jobParam, query: z.object({ from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) }) }),
  asyncHandler(async (req, res) => {
    const est = await Estimate.findOne({ jobId: req.params.jobId });
    if (!est) throw notFound("Estimate");
    const { from, to } = req.query as unknown as { from: number; to: number };
    const a = est.versions.find((x) => x.versionNo === from);
    const b = est.versions.find((x) => x.versionNo === to);
    if (!a || !b) throw notFound("Estimate version");
    res.json(diffVersions(plainItems(a.lineItems as any), plainItems(b.lineItems as any)));
  }),
);
