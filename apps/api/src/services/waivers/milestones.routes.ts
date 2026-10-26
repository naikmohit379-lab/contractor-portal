import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { markReadySchema, milestoneSchema, milestoneUpdateSchema } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { Job } from "../../models/Job";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { milestoneDTOs } from "./shared";

export const milestonesRouter = Router({ mergeParams: true });
milestonesRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const msParam = jobParam.extend({ milestoneId: z.string().refine(isValidObjectId, "Invalid payment id") });

milestonesRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId);
    res.json({ gating: company?.settings?.paymentGating ?? "warn", items: await milestoneDTOs(req.params.jobId!) });
  }),
);

milestonesRouter.post(
  "/",
  requirePermission("payment:request"),
  validate({ params: jobParam, body: milestoneSchema }),
  asyncHandler(async (req, res) => {
    if (!(await Job.exists({ _id: req.params.jobId }))) throw notFound("Job");
    const { dueDate, ...rest } = req.body;
    const m = await PaymentMilestone.create({ ...rest, jobId: req.params.jobId, dueDate: dueDate ? new Date(dueDate) : undefined });
    await audit(req, "milestone.created", "PaymentMilestone", m._id, { label: m.label });
    touchJob(req.auth!.companyId, req.params.jobId, "milestones");
    res.status(201).json((await milestoneDTOs(req.params.jobId!)).find((x) => x.id === m.id));
  }),
);

milestonesRouter.patch(
  "/:milestoneId",
  requirePermission("payment:request"),
  validate({ params: msParam, body: milestoneUpdateSchema }),
  asyncHandler(async (req, res) => {
    const m = await PaymentMilestone.findOne({ _id: req.params.milestoneId, jobId: req.params.jobId });
    if (!m) throw notFound("Payment");
    if (m.status === "paid") throw new AppError(409, "milestone_paid", "A paid milestone cannot be changed");
    const { dueDate, ...rest } = req.body;
    Object.assign(m, rest);
    if (dueDate) m.dueDate = new Date(dueDate);
    await m.save();
    await audit(req, "milestone.updated", "PaymentMilestone", m._id);
    touchJob(req.auth!.companyId, req.params.jobId, "milestones");
    res.json((await milestoneDTOs(req.params.jobId!)).find((x) => x.id === m.id));
  }),
);

/**
 * Payment gating (LW-9). Missing waivers either block (company setting "block") or require an
 * explicit override (setting "warn"); the override is stored on the milestone and in the audit log.
 */
milestonesRouter.post(
  "/:milestoneId/mark-ready",
  requirePermission("payment:request"),
  validate({ params: msParam, body: markReadySchema }),
  asyncHandler(async (req, res) => {
    const m = await PaymentMilestone.findOne({ _id: req.params.milestoneId, jobId: req.params.jobId });
    if (!m) throw notFound("Payment");
    if (m.status !== "pending") throw new AppError(409, "not_pending", `This payment is already ${m.status}`);

    const dto = (await milestoneDTOs(req.params.jobId!)).find((x) => x.id === m.id)!;
    if (!dto.readiness.ready) {
      const names = dto.readiness.missing.map((x) => x.name).join(", ");
      const company = await Company.findById(req.auth!.companyId);
      if ((company?.settings?.paymentGating ?? "warn") === "block") {
        throw new AppError(409, "waivers_missing", `Payment is blocked until these parties sign: ${names}`, dto.readiness.missing);
      }
      if (!req.body.overrideMissing) {
        throw new AppError(409, "waivers_missing_confirm", `Waivers are still missing from: ${names}. Confirm to release the payment anyway.`, dto.readiness.missing);
      }
      m.overrideNote = `Released with waivers missing from ${names}${req.body.reason ? `: ${req.body.reason}` : ""}`;
    }
    m.status = "ready";
    m.readyAt = new Date();
    m.readyBy = req.auth!.userId as any;
    await m.save();
    await audit(req, "milestone.marked_ready", "PaymentMilestone", m._id, { override: !dto.readiness.ready, missing: dto.readiness.missing.map((x) => x.name) });
    touchJob(req.auth!.companyId, req.params.jobId, "milestones", "payments");
    res.json((await milestoneDTOs(req.params.jobId!)).find((x) => x.id === m.id));
  }),
);
