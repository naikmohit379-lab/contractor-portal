import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { RequestHandler, Response } from "express";
import type { Role } from "@roofdesk/shared";
import { env, isProd } from "../config/env";
import { requestContext } from "./context";
import { unauthenticated } from "./errors";

export interface AccessClaims {
  sub: string;
  cid: string;
  role: Role;
}

export const signAccessToken = (claims: AccessClaims) =>
  jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });

/** Verifies the bearer token, then runs the rest of the request inside the tenant context. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthenticated();

  let payload: JwtPayload & AccessClaims;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as JwtPayload & AccessClaims;
  } catch {
    throw unauthenticated("Your session expired. Sign in again.");
  }
  const ctx = { companyId: payload.cid, userId: payload.sub, role: payload.role };
  req.auth = ctx;
  requestContext.run(ctx, () => next());
};

// ---- refresh tokens: opaque, hashed at rest, rotated on every use ----
export const REFRESH_COOKIE = "rd_refresh";
export const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}
export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
