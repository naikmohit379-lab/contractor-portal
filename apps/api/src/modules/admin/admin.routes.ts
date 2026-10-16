import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/auth";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { AuditLog } from "../../models/AuditLog";
import { Claim } from "../../models/Claim";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";
import { OperationsTask } from "../../models/OperationsTask";
import { Payment } from "../../models/Payment";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { User } from "../../models/User";
import { Waiver } from "../../models/Waiver";
import { Company } from "../../models/Company";
import { jobStageLabelsSchema } from "@roofdesk/shared";
import { normalizeStageLabels } from "../jobs/stages";

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePermission("user:manage"));

adminRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings");
    if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
    res.json({ settings: {
      paymentGating: company.settings?.paymentGating ?? "warn",
      refundApprovalThresholdCents: company.settings?.refundApprovalThresholdCents ?? 100000,
      stageLabels: normalizeStageLabels(company.settings?.stageLabels),
    } });
  }),
);

const companySettingsSchema = z.object({
  paymentGating: z.enum(["warn", "block"]),
  refundApprovalThresholdCents: z.number().int().min(0).max(100_000_000),
  stageLabels: jobStageLabelsSchema,
});

adminRouter.put(
  "/settings",
  validate({ body: companySettingsSchema }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId);
    if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
    const before = {
      paymentGating: company.settings?.paymentGating ?? "warn",
      refundApprovalThresholdCents: company.settings?.refundApprovalThresholdCents ?? 100000,
      stageLabels: normalizeStageLabels(company.settings?.stageLabels),
    };
    company.set("settings.paymentGating", req.body.paymentGating);
    company.set("settings.refundApprovalThresholdCents", req.body.refundApprovalThresholdCents);
    company.set("settings.stageLabels", req.body.stageLabels);
    await company.save();
    const after = {
      paymentGating: req.body.paymentGating as "warn" | "block",
      refundApprovalThresholdCents: req.body.refundApprovalThresholdCents as number,
      stageLabels: req.body.stageLabels,
    };
    await AuditLog.create({
      actorId: req.auth!.userId,
      action: "company.settings_updated",
      entity: "Company",
      entityId: company._id,
      meta: { before, after },
    });
    res.json({ settings: after });
  }),
);

/** Company-wide operational snapshot for owners and admins; excludes payment details and audit metadata. */
adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [jobs, activeClaims, openWaivers, flaggedPayments, lateOrders, overdueTasks, activeUsers, recentJobs, activity, documentJobRows] = await Promise.all([
      Job.countDocuments(),
      Claim.countDocuments({ status: { $in: ["submitted", "inspection_scheduled", "supplement_filed"] } }),
      Waiver.countDocuments({ status: { $in: ["requested", "viewed"] } }),
      Payment.countDocuments({ $or: [{ flag: { $exists: true, $ne: "" } }, { status: "failed" }, { disputed: true }] }),
      PurchaseOrder.countDocuments({ status: { $in: ["scheduled", "partially_delivered", "backordered"] }, "deliveryWindow.date": { $lt: now } }),
      OperationsTask.countDocuments({ status: { $in: ["open", "blocked"] }, dueAt: { $lt: now } }),
      User.countDocuments({ status: "active" }),
      Job.find().sort({ updatedAt: -1 }).limit(6).select("jobNumber customer.name property.line1 property.city property.state stage updatedAt"),
      AuditLog.find().sort({ at: -1 }).limit(8).select("actorId action entity entityId at").populate<{ actorId: { name: string } | null }>("actorId", "name"),
      Document.aggregate([{ $group: { _id: "$jobId" } }]),
    ]);

    const jobIdsWithDocuments = documentJobRows.map((row: { _id: unknown }) => row._id);
    const missingDocuments = await Job.countDocuments({ _id: { $nin: jobIdsWithDocuments } });

    res.json({
      generatedAt: now.toISOString(),
      counts: { jobs, activeClaims, openWaivers, flaggedPayments, lateOrders, overdueTasks, activeUsers, missingDocuments },
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customer?.name ?? "Customer",
        address: [job.property?.line1, job.property?.city, job.property?.state].filter(Boolean).join(", "),
        stage: job.stage,
        updatedAt: job.updatedAt.toISOString(),
      })),
      activity: activity.map((entry) => ({
        id: entry.id,
        actorName: entry.actorId?.name ?? "Former user",
        action: entry.action,
        entity: entry.entity,
        entityId: String(entry.entityId),
        at: entry.at.toISOString(),
      })),
    });
  }),
);
