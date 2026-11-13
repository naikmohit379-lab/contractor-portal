import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
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
import { AuditLog } from "../../models/AuditLog";
import { env } from "../../config/env";
import { getProvider } from "./providers";
import { RoofVPendingError } from "./providers/roofVProvider";
import { detectFileType } from "../documents/fileType";
import { getStorage } from "../documents/storageFactory";
import { newStorageKey } from "../documents/storage";
import { fetchRoofVReportPdf } from "./providers/roofVProvider";
import { enqueueMeasurementReport, isMeasurementQueueConfigured } from "./measurementQueue";
import { requestContext } from "../../core/context";

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
  sourcePdf: m.sourcePdf?.storageKey ? {
    source: m.sourcePdf.source ?? "manual",
    filename: m.sourcePdf.filename,
    sizeBytes: m.sourcePdf.sizeBytes,
    sha256: m.sourcePdf.sha256,
    uploadedAt: m.sourcePdf.uploadedAt.toISOString(),
  } : undefined,
  error: m.error,
  sourceNote: m.sourceNote,
  createdAt: m.createdAt.toISOString(),
});

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

    // RoofV publishes the original PDF on the saved job. Fetch it server-side so the
    // provider credential and provider URL never reach the browser. A missing PDF does
    // not invalidate the measurements; a later free refresh can retry this step.
    if (report.provider === "roofv" && report.providerJobId && !report.sourcePdf?.storageKey) {
      try {
        const pdf = await fetchRoofVReportPdf(report.providerJobId);
        if (pdf) {
          const type = detectFileType(pdf.bytes);
          if (type?.contentType !== "application/pdf") throw new Error("RoofV report response was not a supported PDF");
          const storageKey = newStorageKey(String(report.companyId), String(report.jobId), "pdf");
          await getStorage().put(storageKey, pdf.bytes, "application/pdf");
          report.set("sourcePdf", {
            source: "roofv",
            filename: pdf.filename,
            sizeBytes: pdf.bytes.length,
            sha256: createHash("sha256").update(pdf.bytes).digest("hex"),
            storageKey,
            uploadedBy: report.createdBy,
            uploadedAt: new Date(),
          });
          try { await report.save(); }
          catch (err) { await getStorage().delete(storageKey).catch(() => undefined); throw err; }
          await AuditLog.create({
            action: "measurement.source_pdf_retrieved",
            entity: "MeasurementReport",
            entityId: report._id,
            meta: { filename: pdf.filename, bytes: pdf.bytes.length },
          });
        }
      } catch (err) {
        logger.warn({ err, reportId: report.id }, "could not retrieve the RoofV report PDF; measurements remain available");
      }
    }

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

async function dispatchReport(report: any, address: string): Promise<void> {
  if (report.provider === "roofv" && isMeasurementQueueConfigured()) {
    const jobKey = `roofv:${report.id}:${randomUUID()}`;
    report.status = "processing";
    report.providerCheckedAt = new Date();
    report.queueJobKey = jobKey;
    report.queueStartedAt = undefined;
    await report.save();
    await enqueueMeasurementReport(report.id, jobKey);
    return;
  }
  if (report.provider === "roofv" && env.NODE_ENV === "production") {
    throw new AppError(503, "measurement_queue_unavailable", "RoofV report processing is not configured. Contact the administrator; do not order another measurement.");
  }
  setImmediate(() => void processReport(report.id, address));
}

/** QStash delivery entry point. Claims each message and restores the tenant context from its report. */
export async function processQueuedMeasurementReport(reportId: string, jobKey: string): Promise<"processed" | "duplicate" | "missing"> {
  const query = MeasurementReport.findById(reportId).setOptions({ skipTenant: true });
  const record = await query;
  if (!record) return "missing";
  if (record.queueJobKey !== jobKey || record.status !== "processing") return "duplicate";

  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const claim = await MeasurementReport.updateOne({
    _id: record._id,
    companyId: record.companyId,
    status: "processing",
    queueJobKey: jobKey,
    $or: [{ queueStartedAt: { $exists: false } }, { queueStartedAt: { $lte: staleBefore } }],
  }, { $set: { queueStartedAt: new Date() } }).setOptions({ skipTenant: true });
  if (!claim.modifiedCount) {
    const current = await MeasurementReport.findById(reportId).setOptions({ skipTenant: true });
    if (!current || current.queueJobKey !== jobKey || current.status !== "processing") return "duplicate";
    // Ask QStash to retry after the current worker's lease can expire instead of acknowledging lost work.
    throw new Error("Measurement report is already being processed");
  }

  const companyId = String(record.companyId);
  const userId = String(record.createdBy ?? record.companyId);
  const address = record.addressSnapshot ?? "Roof property";
  await requestContext.run({ companyId, userId, role: "admin" }, () => processReport(reportId, address));
  return "processed";
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
          const latest = await MeasurementReport.findById(item._id);
          if (latest) {
            void dispatchReport(latest, item.addressSnapshot ?? "")
              .catch((err) => logger.error({ err, reportId: item.id }, "could not enqueue measurement report refresh"))
              .finally(() => refreshing.delete(item.id));
          } else refreshing.delete(item.id);
        }
      }
    }
    res.json({ items: items.map(toDTO) });
  }),
);

measurementsRouter.get(
  "/:reportId/source-pdf",
  requirePermission("job:read"),
  validate({ params: z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id"), reportId: z.string().refine(isValidObjectId, "Invalid report id") }) }),
  asyncHandler(async (req, res) => {
    const report = await MeasurementReport.findOne({ _id: req.params.reportId, jobId: req.params.jobId, provider: "roofv" });
    if (!report?.sourcePdf?.storageKey) throw notFound("RoofV report PDF");
    const bytes = await getStorage().get(report.sourcePdf.storageKey);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(report.sourcePdf.filename || "roofv-report.pdf")}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    res.send(bytes);
  }),
);

measurementsRouter.post(
  "/:reportId/refresh",
  requirePermission("measurement:order"),
  validate({ params: z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id"), reportId: z.string().refine(isValidObjectId, "Invalid report id") }) }),
  asyncHandler(async (req, res) => {
    const report = await MeasurementReport.findOne({ _id: req.params.reportId, jobId: req.params.jobId, provider: "roofv" });
    if (!report) throw notFound("RoofV measurement report");
    if (!["failed", "processing", "ordered", "delivered"].includes(report.status)) {
      throw new AppError(409, "measurement_not_refreshable", "This RoofV report cannot be checked again.");
    }
    if (report.provider === "roofv" && !isMeasurementQueueConfigured() && env.NODE_ENV === "production") {
      throw new AppError(503, "measurement_queue_unavailable", "RoofV report processing is not configured. Contact the administrator; do not order another measurement.");
    }
    report.status = "processing";
    report.error = undefined;
    report.providerCheckedAt = new Date();
    await report.save();
    if (!refreshing.has(report.id)) {
      refreshing.add(report.id);
      try { await dispatchReport(report, report.addressSnapshot ?? ""); }
      catch (err) {
        report.status = "failed";
        report.error = "The existing RoofV report could not be queued. Contact the administrator; do not order another measurement.";
        await report.save();
        refreshing.delete(report.id);
        throw err;
      }
      finally { refreshing.delete(report.id); }
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
      if (env.NODE_ENV === "production" && !isMeasurementQueueConfigured()) throw new AppError(503, "measurement_queue_unavailable", "RoofV report processing is not configured. Contact the administrator before ordering; no measurement was submitted.");
      if (!req.body.roofvConsent) throw new AppError(400, "roofv_consent_required", "Confirm that the property location will be sent to RoofV and may use your workspace measurement allowance.");
      if (property.country !== "IN") throw new AppError(400, "roofv_india_only", "The Roofora RoofV integration is currently configured for Indian properties.");
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

    try { await dispatchReport(report, address); }
    catch (err) {
      report.status = "failed";
      report.error = "This report was created but could not be queued. Refresh this existing report; do not order another measurement.";
      await report.save();
      throw err;
    }
    res.status(202).json(toDTO(report));
  }),
);
