import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { partySchema, partyUpdateSchema } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Job } from "../../models/Job";
import { Party } from "../../models/Party";
import { Waiver } from "../../models/Waiver";
import { toPartyDTO } from "./shared";

export const partiesRouter = Router({ mergeParams: true });
partiesRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const partyParam = jobParam.extend({ partyId: z.string().refine(isValidObjectId, "Invalid party id") });

partiesRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const items = await Party.find({ jobId: req.params.jobId }).sort({ createdAt: 1 });
    res.json({ items: items.map(toPartyDTO) });
  }),
);

partiesRouter.post(
  "/",
  requirePermission("waiver:request"),
  validate({ params: jobParam, body: partySchema }),
  asyncHandler(async (req, res) => {
    if (!(await Job.exists({ _id: req.params.jobId }))) throw notFound("Job");
    const p = await Party.create({ ...req.body, jobId: req.params.jobId });
    await audit(req, "party.created", "Party", p._id, { name: p.name });
    touchJob(req.auth!.companyId, req.params.jobId, "parties", "milestones");
    res.status(201).json(toPartyDTO(p));
  }),
);

partiesRouter.patch(
  "/:partyId",
  requirePermission("waiver:request"),
  validate({ params: partyParam, body: partyUpdateSchema }),
  asyncHandler(async (req, res) => {
    const p = await Party.findOne({ _id: req.params.partyId, jobId: req.params.jobId });
    if (!p) throw notFound("Party");
    Object.assign(p, req.body);
    await p.save();
    touchJob(req.auth!.companyId, req.params.jobId, "parties", "milestones");
    res.json(toPartyDTO(p));
  }),
);

partiesRouter.delete(
  "/:partyId",
  requirePermission("waiver:request"),
  validate({ params: partyParam }),
  asyncHandler(async (req, res) => {
    const p = await Party.findOne({ _id: req.params.partyId, jobId: req.params.jobId });
    if (!p) throw notFound("Party");
    // Waivers are evidence; a party with any waiver history stays on the job.
    if (await Waiver.exists({ partyId: p._id })) {
      throw new AppError(409, "party_has_waivers", "This party has waivers on record. Turn off waiver requirements instead of removing them.");
    }
    await p.deleteOne();
    await audit(req, "party.deleted", "Party", p._id, { name: p.name });
    touchJob(req.auth!.companyId, req.params.jobId, "parties", "milestones");
    res.status(204).end();
  }),
);
