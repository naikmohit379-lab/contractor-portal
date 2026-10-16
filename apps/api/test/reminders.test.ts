import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJob, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let owner: Session;

beforeAll(async () => {
  app = await startTestApp();
  owner = await registerCompany(app, "Reminder Co");
});
afterAll(async () => { await app?.close(); });

describe("scheduled overdue reminders", () => {
  it("requires the cron secret and creates only one in-app reminder per task per day", async () => {
    const unauthorized = await app.call("GET", "/cron/reminders");
    expect(unauthorized.status).toBe(401);

    const jobId = await createJob(app, owner);
    const { OperationsTask } = await import("../src/models/OperationsTask");
    const { Notification } = await import("../src/models/Notification");
    const task = await OperationsTask.create({
      companyId: owner.companyId,
      jobId,
      title: "Follow up on supplier delivery",
      status: "open",
      dueAt: new Date(Date.now() - 60_000),
      createdBy: owner.userId,
      updatedBy: owner.userId,
    });
    const headers = { authorization: "Bearer integration-cron-secret-for-reminders" };

    const first = await app.call("GET", "/cron/reminders", { headers });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, checked: 1, sent: 1, alreadySent: 0, skipped: 0 });

    const second = await app.call("GET", "/cron/reminders", { headers });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, checked: 1, sent: 0, alreadySent: 1 });

    const notifications = await Notification.find({ userId: owner.userId }).setOptions({ skipTenant: true });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      kind: "operations.overdue_reminder",
      title: "Overdue operations follow-up",
      body: expect.stringContaining("Follow up on supplier delivery"),
      href: `/jobs/${jobId}`,
    });

  });
});
