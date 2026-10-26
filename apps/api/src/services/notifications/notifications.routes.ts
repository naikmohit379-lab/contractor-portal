import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { DEFAULT_EMAIL_GROUPS, NOTIFICATION_GROUPS, type NotificationDTO, type NotificationGroup } from "@roofdesk/shared";
import { requireAuth } from "../../core/auth";
import { notFound } from "../../core/errors";
import { asyncHandler, validate } from "../../core/http";
import { Notification } from "../../models/Notification";
import { User } from "../../models/User";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const toDTO = (n: any): NotificationDTO => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  href: n.href ?? undefined,
  read: !!n.readAt,
  createdAt: n.createdAt.toISOString(),
});

// Each person only ever sees their own notifications (the company scope is added by the tenancy plugin).
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const mine = { userId: req.auth!.userId };
    const [items, unreadCount] = await Promise.all([
      Notification.find(mine).sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ ...mine, readAt: { $exists: false } }),
    ]);
    res.json({ items: items.map(toDTO), unreadCount });
  }),
);

notificationsRouter.post(
  "/read",
  validate({ body: z.object({ ids: z.array(z.string().refine(isValidObjectId)).max(100).optional(), all: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { userId: req.auth!.userId, readAt: { $exists: false } };
    if (!req.body.all) filter._id = { $in: req.body.ids ?? [] };
    await Notification.updateMany(filter, { readAt: new Date() });
    res.status(204).end();
  }),
);

const groups = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

notificationsRouter.get(
  "/preferences",
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.auth!.userId);
    if (!u) throw notFound("User");
    const saved = ((u as any).prefs?.emailGroups ?? {}) as Partial<Record<NotificationGroup, boolean>>;
    res.json({ emailGroups: Object.fromEntries(groups.map((g) => [g, saved[g] ?? DEFAULT_EMAIL_GROUPS[g]])) });
  }),
);

notificationsRouter.put(
  "/preferences",
  validate({ body: z.object({ emailGroups: z.record(z.enum(groups as [NotificationGroup, ...NotificationGroup[]]), z.boolean()) }) }),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.auth!.userId);
    if (!u) throw notFound("User");
    u.set("prefs.emailGroups", { ...((u as any).prefs?.emailGroups ?? {}), ...req.body.emailGroups });
    await u.save();
    res.status(204).end();
  }),
);
