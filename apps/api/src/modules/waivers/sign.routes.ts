import { Router } from "express";
import rateLimit from "express-rate-limit";
import { declineSchema, namesMatch, signSchema, type PublicWaiverDTO } from "@roofdesk/shared";
import { hashToken } from "../../core/auth";
import { notify, touchJob } from "../../core/notify";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, validate } from "../../core/http";
import { AuditLog } from "../../models/AuditLog";
import { Company } from "../../models/Company";
import { Party } from "../../models/Party";
import { Waiver } from "../../models/Waiver";
import { computeDocHash, effectiveStatus } from "./shared";
import { waiverTitle } from "./templates";

/**
 * Public signing endpoints. The secret in the link is the credential: it is stored hashed, expires,
 * and these routes are rate limited. Signing needs no account.
 */
export const signRouter = Router();
signRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

async function byToken(token: string) {
  const w = await Waiver.findOne({ tokenHash: hashToken(token) }).setOptions({ skipTenant: true });
  if (!w) throw notFound("Signing link");
  return w;
}

const log = (w: any, action: string, ip?: string, meta?: unknown) =>
  AuditLog.create({ companyId: w.companyId, action, entity: "Waiver", entityId: w._id, meta, ip });

signRouter.get(
  "/waivers/:token",
  asyncHandler(async (req, res) => {
    const w = await byToken(req.params.token!);
    if (w.status === "requested" && effectiveStatus(w) === "requested") {
      w.status = "viewed";
      w.viewedAt = new Date();
      await w.save();
      await log(w, "waiver.viewed", req.ip);
      touchJob(w.companyId, w.jobId, "waivers", "milestones");
    }
    const [company, party] = await Promise.all([Company.findById(w.companyId), Party.findById(w.partyId).setOptions({ skipTenant: true })]);
    const dto: PublicWaiverDTO = {
      title: waiverTitle(w.type as any),
      status: effectiveStatus(w),
      company: company?.name ?? "",
      partyName: party?.name ?? "",
      amountCents: w.amountCents,
      throughDate: w.throughDate.toISOString(),
      expiresAt: w.expiresAt?.toISOString(),
      text: w.renderedText,
      signedAt: w.signedAt?.toISOString(),
      documentHash: w.documentHash ?? undefined,
    };
    res.json(dto);
  }),
);

async function assertOpen(w: any) {
  const status = effectiveStatus(w);
  if (status === "expired") throw new AppError(410, "link_expired", "This signing link has expired. Ask the contractor to send a new one.");
  if (status !== "requested" && status !== "viewed") throw new AppError(409, "already_answered", `This waiver is already ${status}`);
}

signRouter.post(
  "/waivers/:token/sign",
  validate({ body: signSchema }),
  asyncHandler(async (req, res) => {
    const w = await byToken(req.params.token!);
    await assertOpen(w);
    const party = await Party.findById(w.partyId).setOptions({ skipTenant: true });

    // Soft validation: flag for review rather than refuse, because a real signer may be an employee of the party.
    const needsReview: string[] = [];
    if (!namesMatch(req.body.signerName, [party?.name ?? "", party?.contactName ?? ""])) needsReview.push("Signer name does not match the party or its contact");
    if (!req.body.signatureImage) needsReview.push("No drawn signature, typed name only");

    w.signerName = req.body.signerName;
    w.signatureImage = req.body.signatureImage;
    w.signerIp = req.ip;
    w.signerUserAgent = String(req.headers["user-agent"] ?? "").slice(0, 300);
    w.signedAt = new Date();
    w.needsReview = needsReview as any;
    w.status = "signed";
    w.documentHash = computeDocHash(w);
    w.lockedAt = new Date(); // from here the record is immutable (see the Waiver model)
    await w.save();
    await log(w, "waiver.signed", req.ip, { signer: w.signerName, needsReview });
    touchJob(w.companyId, w.jobId, "waivers", "milestones");
    await notify(w.companyId, {
      kind: "waiver.signed",
      title: `${party?.name ?? "A party"} signed a waiver`,
      body: needsReview.length ? `Signed by ${w.signerName}. Needs a quick review: ${needsReview[0]}.` : `Signed by ${w.signerName}.`,
      href: `/jobs/${w.jobId}?tab=waivers`,
      roles: ["owner", "admin", "pm", "billing"],
    });
    res.json({ status: "signed", documentHash: w.documentHash, signedAt: w.signedAt });
  }),
);

signRouter.post(
  "/waivers/:token/decline",
  validate({ body: declineSchema }),
  asyncHandler(async (req, res) => {
    const w = await byToken(req.params.token!);
    await assertOpen(w);
    w.status = "declined";
    w.declineReason = req.body.reason;
    await w.save();
    await log(w, "waiver.declined", req.ip, { reason: req.body.reason });
    touchJob(w.companyId, w.jobId, "waivers", "milestones");
    const party = await Party.findById(w.partyId).setOptions({ skipTenant: true });
    await notify(w.companyId, {
      kind: "waiver.declined",
      title: `${party?.name ?? "A party"} declined to sign a waiver`,
      body: `Reason: ${req.body.reason}`,
      href: `/jobs/${w.jobId}?tab=waivers`,
      roles: ["owner", "admin", "pm", "billing"],
    });
    res.json({ status: "declined" });
  }),
);
