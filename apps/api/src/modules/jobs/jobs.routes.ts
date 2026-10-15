import { randomBytes } from "node:crypto";
import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { JOB_STAGES, jobCreateSchema, jobListQuerySchema, jobStageSchema, jobUpdateSchema, type JobDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Job } from "../../models/Job";
import { User } from "../../models/User";

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

const idParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const assigneesSchema = z.object({ jobId: z.string().refine(isValidObjectId), userIds: z.array(z.string().refine(isValidObjectId)).max(50) });
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const toJobDTO = (j: any): JobDTO => ({
  id: j.id,
  jobNumber: j.jobNumber,
  customer: { name: j.customer.name, email: j.customer.email, phone: j.customer.phone },
  property: { line1: j.property.line1, city: j.property.city, state: j.property.state, zip: j.property.zip },
  type: j.type,
  stage: j.stage,
  assigneeIds: (j.assigneeIds ?? []).map((id: unknown) => String(id)),
  notes: j.notes,
  createdAt: j.createdAt.toISOString(),
  updatedAt: j.updatedAt.toISOString(),
});

jobsRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ query: jobListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { stage, q, limit, cursor } = req.query as unknown as z.infer<typeof jobListQuerySchema>;
    const filter: Record<string, unknown> = req.auth!.role === "operations" ? { assigneeIds: req.auth!.userId } : {};
    if (stage) filter.stage = stage;
    if (cursor && isValidObjectId(cursor)) filter._id = { $lt: cursor };
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ "customer.name": rx }, { "property.line1": rx }, { jobNumber: rx }];
    }
    const docs = await Job.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1);
    const page = docs.slice(0, limit);
    res.json({
      items: page.map(toJobDTO),
      nextCursor: docs.length > limit ? page[page.length - 1]!.id : null,
    });
  }),
);

jobsRouter.get(
  "/summary",
  requirePermission("job:read"),
  asyncHandler(async (_req, res) => {
    const rows: { _id: string; count: number }[] = await Job.aggregate([
      ...(_req.auth!.role === "operations" ? [{ $match: { assigneeIds: new Types.ObjectId(_req.auth!.userId) } }] : []),
      { $group: { _id: "$stage", count: { $sum: 1 } } },
    ]);
    const byStage = Object.fromEntries(JOB_STAGES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of rows) byStage[r._id] = r.count;
    res.json({ total: rows.reduce((n, r) => n + r.count, 0), byStage });
  }),
);

jobsRouter.get(
  "/assignees",
  requirePermission("job:assign"),
  asyncHandler(async (_req, res) => {
    const users = await User.find({ role: "operations", status: "active" }).select("name email role").sort({ name: 1 });
    res.json({ items: users.map((user) => ({ id: user.id, name: user.name, email: user.email })) });
  }),
);

jobsRouter.post(
  "/",
  requirePermission("job:write"),
  validate({ body: jobCreateSchema }),
  asyncHandler(async (req, res) => {
    const jobNumber = `JOB-${randomBytes(3).toString("hex").toUpperCase()}`;
    const job = await Job.create({ ...req.body, jobNumber, createdBy: req.auth!.userId });
    await audit(req, "job.created", "Job", job._id, { jobNumber });
    touchJob(req.auth!.companyId, job.id);
    res.status(201).json(toJobDTO(job));
  }),
);

jobsRouter.patch(
  "/:jobId/assignees",
  requirePermission("job:assign"),
  validate({ params: idParam, body: assigneesSchema.omit({ jobId: true }) }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    const userIds: string[] = req.body.userIds;
    const users = userIds.length ? await User.find({ _id: { $in: userIds }, role: "operations", status: "active" }).select("_id") : [];
    if (users.length !== userIds.length) throw new AppError(422, "invalid_assignee", "Choose active Operations Intern accounts");
    job.assigneeIds = users.map((user) => user._id);
    await job.save();
    await audit(req, "job.operations_assignees_changed", "Job", job._id, { assigneeIds: userIds });
    touchJob(req.auth!.companyId, job.id);
    res.json({ jobId: job.id, assigneeIds: users.map((user) => user.id) });
  }),
);

jobsRouter.get(
  "/:jobId",
  requirePermission("job:read"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    res.json(toJobDTO(job));
  }),
);

jobsRouter.patch(
  "/:jobId",
  requirePermission("job:write"),
  validate({ params: idParam, body: jobUpdateSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    const { customer, ...rest } = req.body;
    if (customer) job.set("customer", { ...(job.customer ?? {}), ...customer });
    Object.assign(job, rest);
    await job.save();
    await audit(req, "job.updated", "Job", job._id);
    touchJob(req.auth!.companyId, job.id);
    res.json(toJobDTO(job));
  }),
);

jobsRouter.patch(
  "/:jobId/stage",
  requirePermission("job:write"),
  validate({ params: idParam, body: jobStageSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    if (job.stage === req.body.stage) throw new AppError(409, "no_change", "The job is already in this stage");
    const from = job.stage;
    job.stage = req.body.stage;
    await job.save();
    await audit(req, "job.stage_changed", "Job", job._id, { from, to: job.stage });
    touchJob(req.auth!.companyId, job.id);
    res.json(toJobDTO(job));
  }),
);
