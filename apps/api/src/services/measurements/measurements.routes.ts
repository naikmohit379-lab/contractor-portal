import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { measurementOrderSchema, manualMeasurementSchema, metersToFeet, squareMetersToSquareFeet, type MeasurementDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { logger } from "../../core/logger";
import { notify, touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Job } from "../../models/Job";
import { MeasurementReport } from "../../models/MeasurementReport";
import { env } from "../../config/env";
import { getProvider } from "./providers";
import { RoofVPendingError } from "./providers/roofVProvider";

export const measurementsRouter = Router({ mergeParams: true });
measurementsRouter.use(requireAuth);

const params = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const refreshing = new Set<string>();

const toDTO = (m: any): MeasurementDTO => ({
  id: m.id,
  jobId: String(m.jobId),
  provider: m.provider,
  status: m.status,
  preliminary: m.preliminary,
  reviewStatus: m.reviewStatus,
  imageryDate: m.imageryDate?.toISOString(),
  facets: (m.facets ?? []).map((f: any) => ({ id: f.id, areaSqFt: f.areaSqFt, pitch: f.pitch })),
  linear: { ridge: m.linear.ridge, hip: m.linear.hip, valley: m.linear.valley, eave: m.linear.eave, rake: m.linear.rake },
  totals: m.totals?.areaSqFt ? { areaSqFt: m.totals.areaSqFt, squares: m.totals.squares, wastePct: m.totals.wastePct } : undefined,
  error: m.error,
  sourceNote: m.sourceNote,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Step 4 stub: processing runs in-process. Replace with a BullMQ job on the `integrations`
 * queue (retries, backoff, webhook/polling) as described in the architecture doc, section 6.4.
 */
async function processReport(reportId: string, address: string) {
  try {
    const report = await MeasurementReport.findById(reportId);
    if (!report) return;
    const provider = getProvider(report.provider);
    report.status = "processing";
    report.providerCheckedAt = new Date();
    await report.save();

    const data = await provider.fetchReport(report.providerOrderId!, address, report.providerJobId ?? undefined);
    Object.assign(report, data, { status: "delivered" });
    await report.save();

    // First delivered report moves a fresh lead to "measured".
    await Job.updateOne({ _id: report.jobId, stage: "lead" }, { stage: "measured" });

    touchJob(report.companyId, report.jobId, "measurements");
    await notify(report.companyId, {
      kind: "measurement.delivered",
      title: "Aerial report is ready",
      body: `The measurement report for ${address} has arrived.`,
      href: `/jobs/${report.jobId}?tab=measurements`,
      userIds: report.createdBy ? [String(report.createdBy)] : [],
    });
  } catch (err) {
    if (err instanceof RoofVPendingError) {
      await MeasurementReport.updateOne({ _id: reportId }, { status: "processing", error: undefined });
      return;
    }
    logger.error({ err, reportId }, "measurement processing failed");
    await MeasurementReport.updateOne({ _id: reportId }, { status: "failed", error: "The provider could not return this report. Try again." });
    const failed = await MeasurementReport.findById(reportId);
    if (failed) {
      touchJob(failed.companyId, failed.jobId, "measurements");
      await notify(failed.companyId, {
        kind: "measurement.failed",
        title: "Aerial report failed",
        body: `The report for ${address} could not be produced. You can order it again.`,
        href: `/jobs/${failed.jobId}?tab=measurements`,
        userIds: failed.createdBy ? [String(failed.createdBy)] : [],
      });
    }
  }
}

measurementsRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params }),
  asyncHandler(async (req, res) => {
    const items = await MeasurementReport.find({ jobId: req.params.jobId }).sort({ createdAt: -1 });
    // RoofV reads are free. Check pending reports no more often than every five minutes,
    // as recommended by the provider. The database claim also avoids duplicate reads
    // across concurrent Vercel function instances.
    for (const item of items) {
      if (item.provider === "roofv" && item.status === "processing" && !refreshing.has(item.id)) {
        const checkedBefore = new Date(Date.now() - 5 * 60_000);
        const claimed = await MeasurementReport.updateOne({
          _id: item._id,
          status: "processing",
          $or: [{ providerCheckedAt: { $exists: false } }, { providerCheckedAt: { $lte: checkedBefore } }],
        }, { $set: { providerCheckedAt: new Date() } });
        if (claimed.modifiedCount) {
          refreshing.add(item.id);
          setImmediate(() => void processReport(item.id, item.addressSnapshot ?? "").finally(() => refreshing.delete(item.id)));
        }
      }
    }
    res.json({ items: items.map(toDTO) });
  }),
);

measurementsRouter.post(
  "/:reportId/refresh",
  requirePermission("measurement:order"),
  validate({ params: z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id"), reportId: z.string().refine(isValidObjectId, "Invalid report id") }) }),
  asyncHandler(async (req, res) => {
    const report = await MeasurementReport.findOne({ _id: req.params.reportId, jobId: req.params.jobId, provider: "roofv" });
    if (!report) throw notFound("RoofV measurement report");
    if (!["failed", "processing", "ordered"].includes(report.status)) {
      throw new AppError(409, "measurement_not_refreshable", "Only a pending or failed RoofV report can be checked again.");
    }
    report.status = "processing";
    report.error = undefined;
    report.providerCheckedAt = new Date();
    await report.save();
    if (!refreshing.has(report.id)) {
      refreshing.add(report.id);
      setImmediate(() => void processReport(report.id, report.addressSnapshot ?? "").finally(() => refreshing.delete(report.id)));
    }
    res.status(202).json(toDTO(report));
  }),
);

measurementsRouter.post(
  "/manual",
  requirePermission("measurement:order"),
  validate({ params, body: manualMeasurementSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    const property = job.property;
    if (!property) throw new AppError(409, "property_missing", "Add a property address before entering measurements");

    const metric = req.body.measurementSystem === "metric";
    const areaToSquareFeet = (area: number) => metric ? squareMetersToSquareFeet(area) : area;
    const lengthToFeet = (length: number) => metric ? metersToFeet(length) : length;
    const facets = req.body.facets.map((facet: { id: string; area: number; pitch: string }) => ({
      id: facet.id,
      areaSqFt: areaToSquareFeet(facet.area),
      pitch: facet.pitch,
    }));
    const areaSqFt = facets.reduce((total: number, facet: { areaSqFt: number }) => total + facet.areaSqFt, 0);
    const report = await MeasurementReport.create({
      jobId: job._id,
      provider: "manual",
      status: "delivered",
      addressSnapshot: [property.line1, property.line2, property.locality, property.city, property.district, property.state, property.country === "IN" ? property.pinCode : property.zip].filter(Boolean).join(", "),
      imageryDate: req.body.imageryDate ? new Date(`${req.body.imageryDate}T00:00:00.000Z`) : undefined,
      facets,
      linear: {
        ridge: lengthToFeet(req.body.linear.ridge), hip: lengthToFeet(req.body.linear.hip),
        valley: lengthToFeet(req.body.linear.valley), eave: lengthToFeet(req.body.linear.eave),
        rake: lengthToFeet(req.body.linear.rake),
      },
      totals: { areaSqFt, squares: Math.round((areaSqFt / 100) * 10) / 10, wastePct: req.body.wastePct },
      sourceNote: req.body.sourceNote,
      createdBy: req.auth!.userId,
    });
    await audit(req, "measurement.entered", "MeasurementReport", report._id, { provider: "manual", measurementSystem: req.body.measurementSystem });
    await Job.updateOne({ _id: job._id, stage: "lead" }, { stage: "measured" });
    touchJob(req.auth!.companyId, job.id, "measurements");
    res.status(201).json(toDTO(report));
  }),
);

measurementsRouter.post(
  "/",
  requirePermission("measurement:order"),
  validate({ params, body: measurementOrderSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");

    // Idempotency: a retried request must not buy the same paid report twice.
    const idempotencyKey = req.header("Idempotency-Key") ?? undefined;
    if (idempotencyKey) {
      const existing = await MeasurementReport.findOne({ idempotencyKey });
      if (existing) return res.status(200).json(toDTO(existing));
    }

    const property = job.property;
    if (!property) throw new AppError(409, "property_missing", "Add a property address before ordering a measurement report");
    const address = [property.line1, property.line2, property.locality, property.city, property.district, property.state, property.country === "IN" ? property.pinCode : property.zip].filter(Boolean).join(", ");
    const coordinates = property.coordinates?.lat != null && property.coordinates.lng != null
      ? { lat: property.coordinates.lat, lng: property.coordinates.lng }
      : undefined;
    if (req.body.provider === "roofv") {
      if (!env.ROOFV_ENABLED || !env.ROOFV_API_KEY) throw new AppError(503, "roofv_disabled", "RoofV is not enabled on this server yet. Add the server-side API key and enable it in Preview first.");
      if (!req.body.roofvConsent) throw new AppError(400, "roofv_consent_required", "Confirm that the property location will be sent to RoofV and may use your workspace measurement allowance.");
      if (property.country !== "IN") throw new AppError(400, "roofv_india_only", "The RoofDesk RoofV integration is currently configured for Indian properties.");
      if (!coordinates) throw new AppError(409, "coordinates_required", "Add verified property coordinates before requesting a RoofV measurement.");
    }
    const pending = await MeasurementReport.findOne({ jobId: job._id, status: { $in: ["ordered", "processing"] } });
    if (pending) return res.status(202).json(toDTO(pending));
    const provider = getProvider(req.body.provider);
    const stableKey = idempotencyKey ?? `${job.id}-${Date.now()}`;
    const { providerOrderId, providerJobId } = await provider.orderReport({ address, coordinates, pitch: req.body.pitch, building: req.body.building, idempotencyKey: stableKey });

    const report = await MeasurementReport.create({
      jobId: job._id,
      provider: provider.name,
      providerOrderId,
      providerJobId,
      idempotencyKey,
      addressSnapshot: address,
      createdBy: req.auth!.userId,
    });
    await audit(req, "measurement.ordered", "MeasurementReport", report._id, { provider: provider.name });
    touchJob(req.auth!.companyId, job.id, "measurements");

    setImmediate(() => void processReport(report.id, address)); // keeps the tenant context via AsyncLocalStorage
    res.status(202).json(toDTO(report));
  }),
);
