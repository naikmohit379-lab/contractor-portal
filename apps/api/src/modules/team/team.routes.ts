import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { audit } from "../../core/audit";
import { hashToken } from "../../core/auth";
import { requireAuth } from "../../core/auth";
import { env } from "../../config/env";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { User } from "../../models/User";
import { UserInvite } from "../../models/UserInvite";
import { sendLinkEmail } from "../../core/mailer";

export const teamRouter = Router();
teamRouter.use(requireAuth, requirePermission("user:manage"));

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
});

teamRouter.get(
  "/operations",
  asyncHandler(async (req, res) => {
    const [users, invitations] = await Promise.all([
      User.find({ role: "operations" }).select("name email status lastLoginAt").sort({ name: 1 }),
      UserInvite.find({ acceptedAt: null, expiresAt: { $gt: new Date() } }).select("name email expiresAt createdAt").sort({ createdAt: -1 }),
    ]);
    res.json({
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, lastLoginAt: u.lastLoginAt?.toISOString() })),
      invitations: invitations.map((i) => ({ name: i.name, email: i.email, expiresAt: i.expiresAt.toISOString() })),
    });
  }),
);

teamRouter.post(
  "/operations/invitations",
  validate({ body: inviteSchema }),
  asyncHandler(async (req, res) => {
    const { name, email } = req.body;
    if (await User.exists({ email }).setOptions({ skipTenant: true })) {
      res.status(409).json({ error: { code: "email_taken", message: "An account already uses this email address" } });
      return;
    }
    await UserInvite.updateMany({ email, acceptedAt: null }, { $set: { expiresAt: new Date() } });
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const invite = await UserInvite.create({ name, email, tokenHash: hashToken(rawToken), expiresAt, createdBy: req.auth!.userId });
    const company = await Company.findById(req.auth!.companyId);
    const inviteUrl = `${env.WEB_ORIGIN}/invite/${rawToken}`;
    const emailed = env.EMAIL_PROVIDER === "resend" && await sendLinkEmail({
        companyId: req.auth!.companyId,
        to: email,
        kind: "team.operations_invite",
        subject: `Invitation to join ${company?.name ?? "RoofDesk"}`,
        intro: `Hello ${name}, you have been invited to join ${company?.name ?? "a RoofDesk workspace"} as an Operations Intern. Set your password using the secure, single-use link below. It expires in 48 hours.`,
        url: inviteUrl,
      });
    await audit(req, "team.operations_invited", "UserInvite", invite._id, { email });
    res.status(201).json({ invitation: { name, email, expiresAt: expiresAt.toISOString() }, inviteUrl, emailed });
  }),
);
