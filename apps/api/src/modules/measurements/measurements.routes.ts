import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { measurementOrderSchema, type MeasurementDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { logger } from "../../core/logger";
import { notify, touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Job } from "../../models/Job";
import { MeasurementReport } from "../../models/MeasurementReport";
import { getProvider } from "./providers";

export const measurementsRouter = Router({ mergeParams: true });
measurementsRouter.use(requireAuth);

const params = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });

const toDTO = (m: any): MeasurementDTO => ({
  id: m.id,
  jobId: String(m.jobId),
  provider: m.provider,
  status: m.status,
  imageryDate: m.imageryDate?.toISOString(),
  facets: (m.facets ?? []).map((f: any) => ({ id: f.id, areaSqFt: f.areaSqFt, pitch: f.pitch })),
  linear: { ridge: m.linear.ridge, hip: m.linear.hip, valley: m.linear.valley, eave: m.linear.eave, rake: m.linear.rake },
  totals: m.totals?.areaSqFt ? { areaSqFt: m.totals.areaSqFt, squares: m.totals.squares, wastePct: m.totals.wastePct } : undefined,
  error: m.error,
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
    await report.save();

    const data = await provider.fetchReport(report.providerOrderId!, address);
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
    res.json({ items: items.map(toDTO) });
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
    const address = `${property.line1}, ${property.city}, ${property.state} ${property.zip}`;
    const provider = getProvider(req.body.provider);
    const { providerOrderId } = await provider.orderReport({ address, idempotencyKey: idempotencyKey ?? `${job.id}-${Date.now()}` });

    const report = await MeasurementReport.create({
      jobId: job._id,
      provider: provider.name,
      providerOrderId,
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
