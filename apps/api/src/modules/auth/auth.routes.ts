import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { loginSchema, registerSchema, type SessionUser } from "@roofdesk/shared";
import { env } from "../../config/env";
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  hashToken,
  newRefreshToken,
  requireAuth,
  setRefreshCookie,
  signAccessToken,
} from "../../core/auth";
import { AppError, unauthenticated } from "../../core/errors";
import { hashPassword, verifyPassword } from "../../core/password";
import { asyncHandler, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { RefreshToken } from "../../models/RefreshToken";
import { User } from "../../models/User";
import { UserInvite } from "../../models/UserInvite";
import { requestContext } from "../../core/context";

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const acceptInviteSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(10).max(128) });

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";

async function startSession(res: Response, user: { id: string; companyId: unknown; role: string }, family: string = randomUUID()) {
  const raw = newRefreshToken();
  await RefreshToken.create({
    userId: user.id,
    companyId: user.companyId,
    tokenHash: hashToken(raw),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  setRefreshCookie(res, raw);
  return signAccessToken({ sub: user.id, cid: String(user.companyId), role: user.role as SessionUser["role"] });
}

const toSessionUser = (u: any, company: { id: string; name: string }): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  company,
});

authRouter.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { companyName, name, email, password } = req.body;
    const exists = await User.exists({ email }).setOptions({ skipTenant: true });
    if (exists) throw new AppError(409, "email_taken", "An account with this email already exists");

    const company = await Company.create({
      name: companyName,
      slug: `${slugify(companyName)}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const user = await User.create({
      companyId: company._id,
      name,
      email,
      role: "owner",
      passwordHash: await hashPassword(password),
    });
    const accessToken = await startSession(res, { id: user.id, companyId: company._id, role: user.role });
    res.status(201).json({ accessToken, user: toSessionUser(user, { id: company.id, name: company.name }) });
  }),
);

authRouter.post(
  "/accept-invite",
  authLimiter,
  validate({ body: acceptInviteSchema }),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const invite = await UserInvite.findOneAndUpdate(
      { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { acceptedAt: new Date() } },
      { new: true },
    ).setOptions({ skipTenant: true });
    if (!invite) throw new AppError(400, "invite_invalid", "This invitation is invalid, expired, or already used");

    try {
      await requestContext.run({ companyId: String(invite.companyId), userId: String(invite.createdBy), role: "admin" }, async () => {
        if (await User.exists({ email: invite.email }).setOptions({ skipTenant: true })) {
          throw new AppError(409, "email_taken", "An account already uses this email address");
        }
        await User.create({
          companyId: invite.companyId,
          name: invite.name,
          email: invite.email,
          role: "operations",
          passwordHash: await hashPassword(password),
          status: "active",
        });
      });
    } catch (error) {
      await requestContext.run({ companyId: String(invite.companyId), userId: String(invite.createdBy), role: "admin" }, () =>
        UserInvite.updateOne({ _id: invite._id }, { $set: { acceptedAt: null } }),
      );
      throw error;
    }
    res.status(204).end();
  }),
);

authRouter.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+passwordHash").setOptions({ skipTenant: true });
    // Same error for unknown email and wrong password: do not reveal which accounts exist.
    const ok = user && user.status === "active" && (await verifyPassword(user.passwordHash, password));
    if (!user || !ok) throw new AppError(401, "invalid_credentials", "Email or password is incorrect");

    const company = await Company.findById(user.companyId);
    user.lastLoginAt = new Date();
    await user.save();
    const accessToken = await startSession(res, { id: user.id, companyId: user.companyId, role: user.role });
    res.json({ accessToken, user: toSessionUser(user, { id: company!.id, name: company!.name }) });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw unauthenticated();

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
    if (!stored) throw unauthenticated();

    // Reuse of a rotated token means it was likely stolen: revoke the whole family.
    if (stored.revokedAt) {
      await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
      clearRefreshCookie(res);
      throw unauthenticated("Your session is no longer valid. Sign in again.");
    }
    if (stored.expiresAt < new Date()) throw unauthenticated();

    const user = await User.findById(stored.userId).setOptions({ skipTenant: true });
    if (!user || user.status !== "active") throw unauthenticated();

    stored.revokedAt = new Date();
    await stored.save();
    const accessToken = await startSession(res, { id: user.id, companyId: user.companyId, role: user.role }, stored.family);
    res.json({ accessToken });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      const stored = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
      if (stored) await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    }
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId);
    const company = await Company.findById(req.auth!.companyId);
    if (!user || !company) throw unauthenticated();
    res.json({ user: toSessionUser(user, { id: company.id, name: company.name }) });
  }),
);
