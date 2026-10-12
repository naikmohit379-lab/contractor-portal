import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { hasPermission, type Permission, type Role } from "@roofdesk/shared";
import { forbidden } from "./errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { companyId: string; userId: string; role: Role };
    }
  }
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    next();
  };

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || !hasPermission(req.auth.role, permission)) throw forbidden();
    next();
  };
