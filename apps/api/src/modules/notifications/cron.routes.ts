import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env";
import { requestContext } from "../../core/context";
import { asyncHandler } from "../../core/http";
import { Job } from "../../models/Job";
import { Notification } from "../../models/Notification";
import { OperationsTask } from "../../models/OperationsTask";
import { ReminderDelivery } from "../../models/ReminderDelivery";
import { User } from "../../models/User";

export const cronRouter = Router();

cronRouter.get("/reminders", asyncHandler(async (req, res) => {
  const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : "";
  const received = req.header("authorization") ?? "";
  if (!expected) return res.status(503).json({ error: { code: "cron_not_configured", message: "CRON_SECRET is not configured" } });
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    return res.status(401).json({ error: { code: "unauthorized", message: "Invalid cron authorization" } });
  }

  const now = new Date();
  const reminderDay = now.toISOString().slice(0, 10);
  const tasks = await OperationsTask.find({ status: { $in: ["open", "blocked"] }, dueAt: { $lte: now } })
    .setOptions({ skipTenant: true }).sort({ dueAt: 1 }).limit(500)
    .select("companyId jobId createdBy title dueAt").lean();
  let sent = 0;
  let alreadySent = 0;
  let skipped = 0;

  for (const task of tasks) {
    const companyId = String((task as typeof task & { companyId: unknown }).companyId);
    const job = await Job.findById(task.jobId).setOptions({ skipTenant: true }).select("companyId jobNumber assigneeIds").lean();
    if (!job || String((job as typeof job & { companyId: unknown }).companyId) !== companyId) { skipped++; continue; }
    const recipientIds = [...new Set([String(task.createdBy), ...job.assigneeIds.map(String)])];
    const recipients = await User.find({ _id: { $in: recipientIds }, companyId, status: "active" })
      .setOptions({ skipTenant: true }).select("_id").lean();

    await requestContext.run({ companyId, userId: String(task.createdBy), role: "admin" }, async () => {
      for (const recipient of recipients) {
        try {
          await ReminderDelivery.create({ taskId: task._id, userId: recipient._id, reminderDay });
        } catch (error: any) {
          if (error?.code === 11000) { alreadySent++; continue; }
          throw error;
        }
        try {
          await Notification.create({
            userId: recipient._id,
            kind: "operations.overdue_reminder",
            title: "Overdue operations follow-up",
            body: `${task.title} — job ${job.jobNumber}`,
            href: `/jobs/${task.jobId}`,
          });
          sent++;
        } catch (error) {
          await ReminderDelivery.deleteOne({ taskId: task._id, userId: recipient._id, reminderDay });
          throw error;
        }
      }
    });
  }

  res.json({ ok: true, checked: tasks.length, sent, alreadySent, skipped, truncated: tasks.length === 500, reminderDay });
}));
