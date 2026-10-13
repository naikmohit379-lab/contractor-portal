import { wantsEmail, type NotificationDTO, type NotificationKind, type Role } from "@roofdesk/shared";
import { env } from "../config/env";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { logger } from "./logger";
import { sendEmail } from "./mailer";
import { publish } from "./realtime";

/** Tells every open browser tab in the company to refetch these React Query keys. */
export const invalidate = (companyId: unknown, ...keys: string[][]) => publish(String(companyId), null, { type: "invalidate", keys });

/** Refreshes a job's tabs, the pipeline summary and the payments overview in one call. */
export const touchJob = (companyId: unknown, jobId: unknown, ...tabs: string[]) =>
  invalidate(companyId, ...tabs.map((t) => ["jobs", String(jobId), t]), ["jobs", String(jobId)], ["jobs", "summary"], ["payments"]);

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  roles?: Role[];
  userIds?: string[];
  excludeUserId?: string; // usually the person who just did the thing
}

/**
 * Creates in-app notifications, pushes them to open tabs, and emails people who opted in.
 * Never throws and never blocks the caller: a notification problem must not undo a payment.
 */
export async function notify(companyId: unknown, n: NotifyInput): Promise<void> {
  try {
    const cid = String(companyId);
    const or: Record<string, unknown>[] = [];
    if (n.roles?.length) or.push({ role: { $in: n.roles } });
    if (n.userIds?.length) or.push({ _id: { $in: n.userIds } });
    if (or.length === 0) return;

    const users = await User.find({ companyId: cid, status: "active", $or: or }).setOptions({ skipTenant: true });
    const recipients = users.filter((u) => u.id !== n.excludeUserId);
    if (recipients.length === 0) return;

    const docs = await Notification.insertMany(recipients.map((u) => ({ companyId: cid, userId: u._id, kind: n.kind, title: n.title, body: n.body, href: n.href })));
    docs.forEach((d, i) => {
      const dto: NotificationDTO = { id: d.id, kind: d.kind, title: d.title, body: d.body, href: d.href ?? undefined, read: false, createdAt: d.createdAt.toISOString() };
      publish(cid, recipients[i]!.id, { type: "notification", notification: dto });
    });

    for (const u of recipients) {
      const prefs = (u as any).prefs?.emailGroups;
      if (wantsEmail(prefs, n.kind)) {
        void sendEmail({ companyId: cid, to: u.email, subject: n.title, text: `${n.body}${n.href ? `\n\nOpen it: ${env.WEB_ORIGIN}${n.href}` : ""}`, kind: n.kind });
      }
    }
  } catch (err) {
    logger.error({ err, kind: n.kind }, "notify failed");
  }
}
