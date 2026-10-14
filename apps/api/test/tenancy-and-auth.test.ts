import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, addUser, createJob, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let a: Session;
let b: Session;
let jobA: string;

beforeAll(async () => {
  app = await startTestApp();
  a = await registerCompany(app, "Company A");
  b = await registerCompany(app, "Company B");
  jobA = await createJob(app, a);
});
afterAll(() => app.close());

describe("tenant isolation", () => {
  it("hides another company's job and keeps it out of lists", async () => {
    expect((await app.call("GET", `/jobs/${jobA}`, { token: b.token })).status).toBe(404);
    expect((await app.call("GET", "/jobs", { token: b.token })).body.items).toHaveLength(0);
    expect((await app.call("GET", "/jobs", { token: a.token })).body.items).toHaveLength(1);
  });
  it("refuses to change another company's data", async () => {
    expect((await app.call("PATCH", `/jobs/${jobA}/stage`, { token: b.token, body: { stage: "paid" } })).status).toBe(404);
    expect((await app.call("GET", `/jobs/${jobA}`, { token: a.token })).body.stage).toBe("lead");
  });
  it("shows nothing for that job's related records either", async () => {
    for (const p of ["documents", "payments", "waivers", "milestones", "orders"]) {
      const r = await app.call("GET", `/jobs/${jobA}/${p}`, { token: b.token });
      expect(r.status).toBe(200);
      expect(r.body.items ?? r.body.payments ?? []).toHaveLength(0);
    }
  });
  it("makes a query without a tenant context fail loudly, and skipping must be explicit", async () => {
    await expect(app.models.Job.find()).rejects.toThrow(/Tenant context missing/);
    expect((await app.models.Job.find().setOptions({ skipTenant: true })).length).toBeGreaterThanOrEqual(1);
  });
});

describe("authentication", () => {
  it("registers an owner and sets an httpOnly refresh cookie", async () => {
    const email = "fresh-owner@example.com";
    const r = await app.call("POST", "/auth/register", { body: { companyName: "Fresh Co", name: "Fran Fresh", email, password: PASSWORD } });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("owner");
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith("rd_refresh="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });
  it("rejects a duplicate email and a weak password", async () => {
    const dup = await app.call("POST", "/auth/register", { body: { companyName: "X Co", name: "Dup Dup", email: a.email, password: PASSWORD } });
    expect(dup.status).toBe(409);
    const weak = await app.call("POST", "/auth/register", { body: { companyName: "Y Co", name: "Weak Pw", email: "weak@example.com", password: "short" } });
    expect(weak.status).toBe(422);
  });
  it("gives the same answer for an unknown email and a wrong password", async () => {
    const wrong = await app.call("POST", "/auth/login", { body: { email: a.email, password: "wrong password here" } });
    const unknown = await app.call("POST", "/auth/login", { body: { email: "nobody@example.com", password: "wrong password here" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
  it("needs a valid token", async () => {
    expect((await app.call("GET", "/jobs")).status).toBe(401);
    expect((await app.call("GET", "/jobs", { token: "not.a.token" })).status).toBe(401);
  });
  it("rotates refresh tokens, and reusing an old one kills the whole session", async () => {
    const s = await registerCompany(app, "Rotation Co");
    const first = await app.call("POST", "/auth/refresh", { cookie: s.cookie });
    expect(first.status).toBe(200);
    const newCookie = first.headers.getSetCookie().find((c) => c.startsWith("rd_refresh="))!.split(";")[0]!;
    expect(newCookie).not.toBe(s.cookie);
    // The old cookie is replayed (as a thief would): rejected...
    expect((await app.call("POST", "/auth/refresh", { cookie: s.cookie })).status).toBe(401);
    // ...and the newer cookie from the same login no longer works either.
    expect((await app.call("POST", "/auth/refresh", { cookie: newCookie })).status).toBe(401);
  });
  it("logs out for real", async () => {
    const s = await registerCompany(app, "Logout Co");
    expect((await app.call("POST", "/auth/logout", { cookie: s.cookie })).status).toBe(204);
    expect((await app.call("POST", "/auth/refresh", { cookie: s.cookie })).status).toBe(401);
  });
});

describe("roles", () => {
  it("lets read-only people read but not change", async () => {
    const ro = await addUser(app, a.companyId, "readonly");
    expect((await app.call("GET", `/jobs/${jobA}`, { token: ro.token })).status).toBe(200);
    expect((await app.call("PATCH", `/jobs/${jobA}/stage`, { token: ro.token, body: { stage: "measured" } })).status).toBe(403);
  });
  it("keeps money reports to owners, admins and billing", async () => {
    const est = await addUser(app, a.companyId, "estimator");
    const billing = await addUser(app, a.companyId, "billing");
    expect((await app.call("GET", "/reports/overview", { token: est.token })).status).toBe(403);
    expect((await app.call("GET", "/reports/overview", { token: billing.token })).status).toBe(200);
    expect((await app.call("GET", "/reports/overview", { token: a.token })).status).toBe(200);
  });
});
