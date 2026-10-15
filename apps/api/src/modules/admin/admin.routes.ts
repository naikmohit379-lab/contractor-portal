import { Router } from "express";
import { requireAuth } from "../../core/auth";
import { asyncHandler, requirePermission } from "../../core/http";
import { AuditLog } from "../../models/AuditLog";
import { Claim } from "../../models/Claim";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";
import { OperationsTask } from "../../models/OperationsTask";
import { Payment } from "../../models/Payment";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { User } from "../../models/User";
import { Waiver } from "../../models/Waiver";

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePermission("user:manage"));

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
