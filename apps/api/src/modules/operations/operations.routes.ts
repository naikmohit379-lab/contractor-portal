import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { requireAuth } from "../../core/auth";
import { forbidden, notFound } from "../../core/errors";
import { audit } from "../../core/audit";
import { Claim } from "../../models/Claim";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";
import { OperationsTask } from "../../models/OperationsTask";
import { Party } from "../../models/Party";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { Waiver } from "../../models/Waiver";

export const operationsRouter = Router();
operationsRouter.use(requireAuth, requirePermission("ops:dashboard:view"));

const createTaskSchema = z.object({
  jobId: z.string().refine(isValidObjectId, "Choose a valid job"),
  title: z.string().trim().min(3).max(140),
  details: z.string().trim().max(1200).optional(),
  dueAt: z.string().datetime().optional(),
});
const updateTaskSchema = z.object({
  taskId: z.string().refine(isValidObjectId, "Invalid task"),
});
const taskStatusSchema = z.object({ status: z.enum(["open", "blocked", "done"]) });

operationsRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const assignedOnly = req.auth!.role === "operations";
    const jobFilter = assignedOnly ? { assigneeIds: req.auth!.userId } : {};
    const [jobs, assignedJobCount] = await Promise.all([
      Job.find(jobFilter).sort({ updatedAt: -1 }).limit(100).select("jobNumber customer.name property.line1 property.city property.state stage updatedAt"),
      Job.countDocuments(jobFilter),
    ]);
    const jobIds = jobs.map((job) => job._id);
    const [documents, claims, waivers, orders, tasks] = await Promise.all([
      Document.aggregate([
        { $match: { jobId: { $in: jobIds } } },
        { $group: { _id: "$jobId", count: { $sum: 1 }, photos: { $sum: { $cond: [{ $eq: ["$kind", "photo"] }, 1, 0] } } } },
      ]),
      Claim.find({ jobId: { $in: jobIds }, status: { $in: ["submitted", "inspection_scheduled", "supplement_filed"] } }).select("jobId claimNo carrier status updatedAt"),
      Waiver.find({ jobId: { $in: jobIds }, status: { $in: ["requested", "viewed"] } }).sort({ requestedAt: 1 }).limit(30).select("jobId partyId status requestedAt type"),
      PurchaseOrder.find({ jobId: { $in: jobIds }, status: { $in: ["sent", "confirmed", "scheduled", "partially_delivered", "backordered"] } }).sort({ updatedAt: -1 }).limit(30).select("jobId poNumber status deliveryWindow updatedAt"),
      OperationsTask.find({ jobId: { $in: jobIds }, status: { $ne: "done" } }).sort({ dueAt: 1, createdAt: -1 }).limit(30),
    ]);
    const docCounts = new Map<string, { count: number; photos: number }>(documents.map((row: any) => [String(row._id), { count: row.count as number, photos: row.photos as number }] as const));
    const jobMap = new Map(jobs.map((job) => [job.id, {
      id: job.id,
      jobNumber: job.jobNumber,
      customerName: job.customer?.name ?? "Customer",
      address: [job.property?.line1, job.property?.city, job.property?.state].filter(Boolean).join(", "),
      stage: job.stage,
      updatedAt: job.updatedAt.toISOString(),
    }] as const));
    const partyIds = waivers.map((waiver) => waiver.partyId);
    const parties = await Party.find({ _id: { $in: partyIds } }).select("name");
    const partyMap = new Map(parties.map((party) => [party.id, party.name] as const));
    const jobDTO = (id: unknown) => jobMap.get(String(id));
    const missingDocuments = jobs.filter((job) => (docCounts.get(job.id)?.count ?? 0) === 0).map((job) => ({ job: jobMap.get(job.id)! }));

    res.json({
      generatedAt: new Date().toISOString(),
      counts: {
        assignedJobs: assignedJobCount,
        missingDocuments: missingDocuments.length,
        claimsNeedingFollowUp: claims.length,
        unsignedWaivers: waivers.length,
        supplierOrdersNeedingAttention: orders.length,
        openTasks: tasks.length,
      },
      queues: {
        assignedJobs: jobs.map((job) => jobMap.get(job.id)),
        missingDocuments,
        claims: claims.map((claim) => ({ job: jobDTO(claim.jobId), claimNo: claim.claimNo, carrier: claim.carrier, status: claim.status, updatedAt: claim.updatedAt.toISOString() })),
        waivers: waivers.map((waiver) => ({ job: jobDTO(waiver.jobId), partyName: partyMap.get(String(waiver.partyId)) ?? "Project party", status: waiver.status, type: waiver.type, requestedAt: waiver.requestedAt.toISOString() })),
        orders: orders.map((order) => ({ job: jobDTO(order.jobId), poNumber: order.poNumber, status: order.status, deliveryDate: order.deliveryWindow?.date?.toISOString(), updatedAt: order.updatedAt.toISOString() })),
        tasks: tasks.map((task) => ({ id: task.id, job: jobDTO(task.jobId), title: task.title, details: task.details, status: task.status, dueAt: task.dueAt?.toISOString(), updatedAt: task.updatedAt.toISOString() })),
      },
    });
  }),
);

operationsRouter.post(
  "/tasks",
  requirePermission("ops:task:create"),
  validate({ body: createTaskSchema }),
  asyncHandler(async (req, res) => {
    const assignedOnly = req.auth!.role === "operations";
    const job = await Job.findOne(assignedOnly ? { _id: req.body.jobId, assigneeIds: req.auth!.userId } : { _id: req.body.jobId });
    if (!job) throw notFound("Assigned job");
    const task = await OperationsTask.create({
      jobId: job._id,
      title: req.body.title,
      details: req.body.details,
      dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
      createdBy: req.auth!.userId,
      updatedBy: req.auth!.userId,
    });
    await audit(req, "operations.task_created", "OperationsTask", task._id, { jobNumber: job.jobNumber, title: task.title });
    res.status(201).json({ id: task.id, jobId: String(task.jobId), title: task.title, details: task.details, status: task.status, dueAt: task.dueAt?.toISOString() });
  }),
);

operationsRouter.patch(
  "/tasks/:taskId",
  requirePermission("ops:task:update"),
  validate({ params: updateTaskSchema, body: taskStatusSchema }),
  asyncHandler(async (req, res) => {
    const assignedOnly = req.auth!.role === "operations";
    const task = await OperationsTask.findById(req.params.taskId);
    if (!task) throw notFound("Task");
    const job = await Job.findOne(assignedOnly ? { _id: task.jobId, assigneeIds: req.auth!.userId } : { _id: task.jobId });
    if (!job) throw forbidden("This task is outside your assigned work");
    const from = task.status;
    task.status = req.body.status;
    task.updatedBy = req.auth!.userId as any;
    await task.save();
    await audit(req, "operations.task_status_changed", "OperationsTask", task._id, { from, to: task.status, jobNumber: job.jobNumber });
    res.json({ id: task.id, status: task.status });
  }),
);
