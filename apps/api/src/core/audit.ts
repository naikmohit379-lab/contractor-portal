import type { Request } from "express";
import type { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog";

/** Append-only record of who did what. Call inside an authenticated request. */
export async function audit(req: Request, action: string, entity: string, entityId: Types.ObjectId | string, meta?: unknown) {
  await AuditLog.create({ actorId: req.auth?.userId, action, entity, entityId, meta, ip: req.ip });
}
