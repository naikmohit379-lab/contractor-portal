import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, createJob, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let s: Session;
beforeAll(async () => { app = await startTestApp(); s = await registerCompany(app); });
afterAll(() => app.close());

describe("overview", () => {
  it("has the full shape even for a company with no activity", async () => {
    const r = await app.call("GET", "/reports/overview", { token: s.token });
    expect(r.status).toBe(200);
    expect(r.body.collectedByMonth).toHaveLength(6);
    expect(r.body.waivers.aging).toHaveLength(4);
    expect(r.body.claims.approval.ratePct).toBeNull();
    expect(r.body.receivables).toEqual({ billedOutstandingCents: 0, awaitingWaiversCents: 0, overdueCents: 0, openRequestedCents: 0 });
  });
});

describe("CSV export", () => {
  it("protects spreadsheets from formula injection and sets download headers", async () => {
    await createJob(app, s, '=HYPERLINK("http://evil.example")');
    const r = await app.call("GET", "/reports/export/jobs.csv", { token: s.token });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="roofdesk-jobs-/);
    expect(r.body).toContain("'=HYPERLINK"); // the leading apostrophe stops it running as a formula
    expect(r.body).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(r.body).toContain("State / Union Territory");
    expect(r.body).toContain("PIN code");
  });
  it("uses currency-neutral export headings for the Indian workspace and omits U.S. waiver exports", async () => {
    const payments = await app.call("GET", "/reports/export/payments.csv", { token: s.token });
    expect(payments.status).toBe(200);
    expect(payments.body).toContain("Currency code");
    expect(payments.body).not.toContain("Amount USD");
    expect((await app.call("GET", "/reports/export/waivers.csv", { token: s.token })).status).toBe(404);
  });
  it("is limited to people who may see money, and to known report names", async () => {
    const est = await addUser(app, s.companyId, "estimator");
    expect((await app.call("GET", "/reports/export/payments.csv", { token: est.token })).status).toBe(403);
    expect((await app.call("GET", "/reports/export/secrets.csv", { token: s.token })).status).toBe(422);
  });
});
