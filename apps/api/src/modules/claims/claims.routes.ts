import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  CLAIM_STATUS_LABELS,
  canTransitionClaim,
  claimCreateSchema,
  claimStatusSchema,
  claimUpdateSchema,
  communicationSchema,
  type ClaimDTO,
  type CommunicationDTO,
} from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { notify, touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Claim } from "../../models/Claim";
import { Communication } from "../../models/Communication";
import { Estimate } from "../../models/Estimate";
import { Job } from "../../models/Job";
import { MeasurementReport } from "../../models/MeasurementReport";
import { toEstimateDTO } from "../estimates/estimates.routes";
import { toJobDTO } from "../jobs/jobs.routes";
import { advanceStage } from "../jobs/stages";

export const claimsRouter = Router({ mergeParams: true });
claimsRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });

const toClaimDTO = (c: any): ClaimDTO => ({
  id: c.id,
  jobId: String(c.jobId),
  carrier: c.carrier,
  policyNo: c.policyNo,
  claimNo: c.claimNo,
  dateOfLoss: c.dateOfLoss.toISOString(),
  adjuster: { name: c.adjuster?.name, phone: c.adjuster?.phone, email: c.adjuster?.email },
  deductibleCents: c.deductibleCents,
  status: c.status,
  approvedAmountCents: c.approvedAmountCents ?? undefined,
  statusHistory: c.statusHistory.map((h: any) => ({ from: h.from, to: h.to, at: h.at.toISOString(), note: h.note })),
  createdAt: c.createdAt.toISOString(),
});

const toCommDTO = (c: any): CommunicationDTO => ({
  id: c.id,
  channel: c.channel,
  direction: c.direction,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
});

claimsRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const claim = await Claim.findOne({ jobId: req.params.jobId });
    res.json({ claim: claim ? toClaimDTO(claim) : null });
  }),
);

claimsRouter.post(
  "/",
  requirePermission("claim:write"),
  validate({ params: jobParam, body: claimCreateSchema }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    if (await Claim.exists({ jobId: job._id })) throw new AppError(409, "claim_exists", "This job already has a claim");

    const { dateOfLoss, ...rest } = req.body;
    const claim = await Claim.create({
      ...rest,
      jobId: job._id,
      dateOfLoss: new Date(dateOfLoss),
      status: "draft",
      statusHistory: [{ to: "draft", by: req.auth!.userId }],
      createdBy: req.auth!.userId,
    });

    // Carry the deductible into the working estimate so ACV and net claim are right from the start.
    const est = await Estimate.findOne({ jobId: job._id });
    const current = est?.versions.find((v) => v.versionNo === est.currentVersion);
    if (est && current && !current.lockedAt) {
      current.settings!.deductibleCents = claim.deductibleCents;
      await est.save();
    }
    await audit(req, "claim.created", "Claim", claim._id, { claimNo: claim.claimNo });
    touchJob(req.auth!.companyId, job.id, "claim", "estimate");
    res.status(201).json({ claim: toClaimDTO(claim) });
  }),
);

claimsRouter.patch(
  "/",
  requirePermission("claim:write"),
  validate({ params: jobParam, body: claimUpdateSchema }),
  asyncHandler(async (req, res) => {
    const claim = await Claim.findOne({ jobId: req.params.jobId });
    if (!claim) throw notFound("Claim");
    const { dateOfLoss, adjuster, ...rest } = req.body;
    Object.assign(claim, rest);
    if (dateOfLoss) claim.dateOfLoss = new Date(dateOfLoss);
    if (adjuster) Object.assign(claim.adjuster!, adjuster);
    await claim.save();
    await audit(req, "claim.updated", "Claim", claim._id);
    touchJob(req.auth!.companyId, claim.jobId, "claim");
    res.json({ claim: toClaimDTO(claim) });
  }),
);

claimsRouter.post(
  "/status",
  requirePermission("claim:write"),
  validate({ params: jobParam, body: claimStatusSchema }),
  asyncHandler(async (req, res) => {
    const claim = await Claim.findOne({ jobId: req.params.jobId });
    if (!claim) throw notFound("Claim");
    const { status, note, approvedAmountCents } = req.body;

    if (!canTransitionClaim(claim.status as any, status)) {
      throw new AppError(409, "invalid_transition", `A claim that is "${CLAIM_STATUS_LABELS[claim.status as keyof typeof CLAIM_STATUS_LABELS]}" cannot move to "${CLAIM_STATUS_LABELS[status as keyof typeof CLAIM_STATUS_LABELS]}"`);
    }

    const est = await Estimate.findOne({ jobId: claim.jobId });
    const current = est?.versions.find((v) => v.versionNo === est.currentVersion);

    if (status === "submitted") {
      if (!est || !current) throw new AppError(422, "estimate_required", "Build an estimate before submitting the claim");
      current.lockedAt ??= new Date(); // what the carrier saw can no longer change
      await est.save();
      await advanceStage(claim.jobId, "claim_filed");
    }
    if (status === "supplement_filed" && current?.kind !== "supplement") {
      throw new AppError(422, "supplement_required", "Create a supplement version of the estimate before filing a supplement");
    }
    if (status === "approved" || status === "partially_approved") {
      if (approvedAmountCents !== undefined) claim.approvedAmountCents = approvedAmountCents;
      await advanceStage(claim.jobId, "approved");
    }

    claim.statusHistory.push({ from: claim.status, to: status, note, by: req.auth!.userId } as any);
    claim.status = status;
    await claim.save();
    await audit(req, "claim.status_changed", "Claim", claim._id, { to: status });
    touchJob(req.auth!.companyId, claim.jobId, "claim", "estimate");
    await notify(req.auth!.companyId, {
      kind: "claim.status_changed",
      title: `Claim ${claim.claimNo} is now ${CLAIM_STATUS_LABELS[status as keyof typeof CLAIM_STATUS_LABELS].toLowerCase()}`,
      body: `${claim.carrier}${note ? `: ${note}` : ""}`,
      href: `/jobs/${claim.jobId}?tab=claim`,
      roles: ["owner", "admin", "estimator"],
      excludeUserId: req.auth!.userId,
    });
    res.json({ claim: toClaimDTO(claim) });
  }),
);

claimsRouter.get(
  "/communications",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const claim = await Claim.findOne({ jobId: req.params.jobId });
    if (!claim) return res.json({ items: [] });
    const items = await Communication.find({ claimId: claim._id }).sort({ createdAt: -1 });
    res.json({ items: items.map(toCommDTO) });
  }),
);

claimsRouter.post(
  "/communications",
  requirePermission("claim:write"),
  validate({ params: jobParam, body: communicationSchema }),
  asyncHandler(async (req, res) => {
    const claim = await Claim.findOne({ jobId: req.params.jobId });
    if (!claim) throw notFound("Claim");
    const c = await Communication.create({ ...req.body, claimId: claim._id, createdBy: req.auth!.userId });
    touchJob(req.auth!.companyId, claim.jobId, "comms");
    res.status(201).json(toCommDTO(c));
  }),
);

/** Everything the printable claim packet page needs, in one call. */
claimsRouter.get(
  "/packet",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const [job, claim, est, measurement] = await Promise.all([
      Job.findById(req.params.jobId),
      Claim.findOne({ jobId: req.params.jobId }),
      Estimate.findOne({ jobId: req.params.jobId }),
      MeasurementReport.findOne({ jobId: req.params.jobId, status: "delivered" }).sort({ createdAt: -1 }),
    ]);
    if (!job || !claim || !est) throw new AppError(422, "packet_incomplete", "Add the claim details and an estimate before building a packet");
    const comms = await Communication.find({ claimId: claim._id }).sort({ createdAt: 1 });
    const dto = toEstimateDTO(est);
    res.json({
      job: toJobDTO(job),
      claim: toClaimDTO(claim),
      estimate: dto.versions.find((v) => v.versionNo === dto.currentVersion),
      measurement: measurement
        ? { totals: measurement.totals, linear: measurement.linear, facets: measurement.facets, imageryDate: measurement.imageryDate }
        : null,
      communications: comms.map(toCommDTO),
    });
  }),
);
