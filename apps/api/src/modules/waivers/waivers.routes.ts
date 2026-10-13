import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  acceptableWaiverTypes,
  defaultRequestType,
  isExpired,
  waiverBulkSchema,
  waiverRequestSchema,
  type WaiverType,
} from "@roofdesk/shared";
import { env } from "../../config/env";
import { audit } from "../../core/audit";
import { hashToken, newRefreshToken, requireAuth } from "../../core/auth";
import { sendLinkEmail } from "../../core/mailer";
import { touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { Job } from "../../models/Job";
import { Party } from "../../models/Party";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { Waiver } from "../../models/Waiver";
import { WaiverTemplate } from "../../models/WaiverTemplate";
import { computeDocHash, toWaiverDTO } from "./shared";
import { ensureTemplates, renderTemplate } from "./templates";

export const waiversRouter = Router({ mergeParams: true });
waiversRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const waiverParam = jobParam.extend({ waiverId: z.string().refine(isValidObjectId, "Invalid waiver id") });

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const longDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const signUrl = (token: string) => `${env.WEB_ORIGIN}/sign/${token}`;
const expiry = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/** Creates one waiver request. The wording is frozen into the record so later template edits never change what was sent. */
async function createWaiver(
  req: any,
  ctx: { job: any; companyName: string; milestone: any; party: any; type: WaiverType; amountCents: number; throughDate: Date; expiresInDays: number },
) {
  await ensureTemplates();
  const tpl = await WaiverTemplate.findOne({ type: ctx.type, state: "*", active: true });
  if (!tpl?.legalApproved) {
    throw new AppError(422, "template_not_approved", "This waiver form has not been approved for use yet. An owner or admin must review it with counsel and approve it under Waiver forms.");
  }
  if (!acceptableWaiverTypes(ctx.milestone.type).includes(ctx.type)) {
    throw new AppError(422, "wrong_waiver_type", `A ${ctx.milestone.type} payment needs a ${ctx.milestone.type === "final" ? "final" : "progress"} waiver`);
  }
  const text = renderTemplate(tpl.body, {
    partyName: ctx.party.name,
    companyName: ctx.companyName,
    ownerName: ctx.job.customer.name,
    propertyAddress: `${ctx.job.property.line1}, ${ctx.job.property.city}, ${ctx.job.property.state} ${ctx.job.property.zip}`,
    jobNumber: ctx.job.jobNumber,
    amount: usd(ctx.amountCents),
    throughDate: longDate(ctx.throughDate),
  });
  const token = newRefreshToken();
  const waiver = await Waiver.create({
    jobId: ctx.job._id,
    milestoneId: ctx.milestone._id,
    partyId: ctx.party._id,
    type: ctx.type,
    amountCents: ctx.amountCents,
    throughDate: ctx.throughDate,
    templateVersion: tpl.version,
    renderedText: text,
    tokenHash: hashToken(token),
    expiresAt: expiry(ctx.expiresInDays),
    requestedBy: req.auth.userId,
  });
  await audit(req, "waiver.requested", "Waiver", waiver._id, { party: ctx.party.name, type: ctx.type, amountCents: ctx.amountCents });
  touchJob(req.auth.companyId, ctx.job._id, "waivers", "milestones");

  // If the party has an email on file, send the signing link to them directly.
  const emailedTo = ctx.party.email && (await sendLinkEmail({
    companyId: req.auth.companyId,
    to: ctx.party.email,
    kind: "waiver.link",
    subject: `Lien waiver to sign: ${ctx.job.property.line1}`,
    intro: `${ctx.companyName} has asked ${ctx.party.name} to sign a waiver for ${usd(ctx.amountCents)} on ${ctx.job.property.line1}. Please read it and sign using the link below.`,
    url: signUrl(token),
  })) ? ctx.party.email : undefined;
  return { waiver, token, emailedTo };
}

async function loadContext(req: any, milestoneId: string) {
  if (!isValidObjectId(milestoneId)) throw new AppError(422, "invalid_payment", "Choose a payment");
  const [job, company, milestone] = await Promise.all([
    Job.findById(req.params.jobId),
    Company.findById(req.auth.companyId),
    PaymentMilestone.findOne({ _id: milestoneId, jobId: req.params.jobId }),
  ]);
  if (!job) throw notFound("Job");
  if (!milestone) throw notFound("Payment");
  return { job, companyName: company?.name ?? "Contractor", milestone };
}

waiversRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const items = await Waiver.find({ jobId: req.params.jobId }).sort({ createdAt: -1 });
    res.json({ items: items.map(toWaiverDTO) });
  }),
);

waiversRouter.post(
  "/",
  requirePermission("waiver:request"),
  validate({ params: jobParam, body: waiverRequestSchema }),
  asyncHandler(async (req, res) => {
    const base = await loadContext(req, req.body.milestoneId);
    if (!isValidObjectId(req.body.partyId)) throw new AppError(422, "invalid_party", "Choose a party");
    const party = await Party.findOne({ _id: req.body.partyId, jobId: req.params.jobId });
    if (!party) throw notFound("Party");
    const { waiver, token, emailedTo } = await createWaiver(req, { ...base, party, type: req.body.type, amountCents: req.body.amountCents, throughDate: new Date(req.body.throughDate), expiresInDays: req.body.expiresInDays });
    res.status(201).json({ waiver: toWaiverDTO(waiver), signUrl: signUrl(token), emailedTo });
  }),
);

/**
 * Requests waivers from every party that still owes one for this payment.
 * Each party's amount is its share of the payment, proportional to its contract amount.
 */
waiversRouter.post(
  "/bulk",
  requirePermission("waiver:request"),
  validate({ params: jobParam, body: waiverBulkSchema }),
  asyncHandler(async (req, res) => {
    const base = await loadContext(req, req.body.milestoneId);
    const type: WaiverType = req.body.type ?? defaultRequestType(base.milestone.type);
    const [parties, existing] = await Promise.all([
      Party.find({ jobId: req.params.jobId, requiresWaiver: true }),
      Waiver.find({ milestoneId: base.milestone._id }),
    ]);
    const totalContract = parties.reduce((n, p) => n + p.contractAmountCents, 0);
    const accept = new Set(acceptableWaiverTypes(base.milestone.type));

    const created: { party: string; signUrl: string; emailedTo?: string; waiver: ReturnType<typeof toWaiverDTO> }[] = [];
    const skipped: { party: string; reason: string }[] = [];

    for (const party of parties) {
      const mine = existing.filter((w) => String(w.partyId) === party.id && accept.has(w.type as WaiverType));
      if (mine.some((w) => w.status === "signed")) { skipped.push({ party: party.name, reason: "Already signed" }); continue; }
      if (mine.some((w) => (w.status === "requested" || w.status === "viewed") && !isExpired(w.status, w.expiresAt))) { skipped.push({ party: party.name, reason: "Request already open" }); continue; }
      if (party.contractAmountCents <= 0 || totalContract <= 0) { skipped.push({ party: party.name, reason: "Add a contract amount first" }); continue; }

      const amountCents = Math.round((base.milestone.expectedAmountCents * party.contractAmountCents) / totalContract);
      const { waiver, token, emailedTo } = await createWaiver(req, { ...base, party, type, amountCents, throughDate: new Date(req.body.throughDate), expiresInDays: req.body.expiresInDays });
      created.push({ party: party.name, signUrl: signUrl(token), emailedTo, waiver: toWaiverDTO(waiver) });
    }
    res.status(201).json({ created, skipped });
  }),
);

/** The original link is only shown once, so "resend" issues a fresh link and invalidates the old one. */
waiversRouter.post(
  "/:waiverId/resend",
  requirePermission("waiver:request"),
  validate({ params: waiverParam }),
  asyncHandler(async (req, res) => {
    const w = await Waiver.findOne({ _id: req.params.waiverId, jobId: req.params.jobId });
    if (!w) throw notFound("Waiver");
    if (w.status === "signed" || w.status === "declined" || w.status === "cancelled") throw new AppError(409, "waiver_closed", `This waiver is ${w.status}`);
    const token = newRefreshToken();
    w.tokenHash = hashToken(token);
    w.expiresAt = expiry(14);
    w.status = "requested";
    await w.save();
    await audit(req, "waiver.link_reissued", "Waiver", w._id);
    touchJob(req.auth!.companyId, req.params.jobId, "waivers", "milestones");
    const [party, company, job] = await Promise.all([Party.findById(w.partyId), Company.findById(req.auth!.companyId), Job.findById(w.jobId)]);
    const emailedTo = party?.email && (await sendLinkEmail({
      companyId: req.auth!.companyId,
      to: party.email,
      kind: "waiver.link",
      subject: `Lien waiver to sign: ${job?.property?.line1 ?? "your project"}`,
      intro: `${company?.name ?? "A contractor"} sent you a new link to sign a waiver for ${usd(w.amountCents)}. The earlier link no longer works.`,
      url: signUrl(token),
    })) ? party.email : undefined;
    res.json({ waiver: toWaiverDTO(w), signUrl: signUrl(token), emailedTo });
  }),
);

waiversRouter.post(
  "/:waiverId/cancel",
  requirePermission("waiver:request"),
  validate({ params: waiverParam }),
  asyncHandler(async (req, res) => {
    const w = await Waiver.findOne({ _id: req.params.waiverId, jobId: req.params.jobId });
    if (!w) throw notFound("Waiver");
    if (w.status === "signed") throw new AppError(409, "waiver_signed", "A signed waiver cannot be cancelled. Request a new one if a correction is needed.");
    w.status = "cancelled";
    w.tokenHash = undefined;
    await w.save();
    await audit(req, "waiver.cancelled", "Waiver", w._id);
    touchJob(req.auth!.companyId, req.params.jobId, "waivers", "milestones");
    res.json({ waiver: toWaiverDTO(w) });
  }),
);

/** The executed document, plus an integrity check that recomputes its fingerprint. */
waiversRouter.get(
  "/:waiverId",
  requirePermission("job:read"),
  validate({ params: waiverParam }),
  asyncHandler(async (req, res) => {
    const w = await Waiver.findOne({ _id: req.params.waiverId, jobId: req.params.jobId });
    if (!w) throw notFound("Waiver");
    res.json({
      waiver: toWaiverDTO(w),
      text: w.renderedText,
      signatureImage: w.signatureImage ?? undefined,
      integrity: w.status === "signed" ? (computeDocHash(w) === w.documentHash ? "valid" : "tampered") : "not_signed",
    });
  }),
);
