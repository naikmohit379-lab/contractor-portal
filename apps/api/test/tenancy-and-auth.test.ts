import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
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
  it("creates an Indian property with a PIN and district while keeping existing U.S. jobs readable", async () => {
    const created = await app.call("POST", "/jobs", { token: a.token, body: {
      customer: { name: "Bengaluru Customer" },
      property: { line1: "12 Example Road", city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka", pinCode: "560001", country: "IN" },
      type: "residential",
    } });
    expect(created.status).toBe(201);
    expect(created.body.property).toMatchObject({ country: "IN", district: "Bengaluru Urban", pinCode: "560001" });
    const { requestContext } = await import("../src/core/context");
    const legacy = await requestContext.run({ companyId: a.companyId, userId: a.userId, role: "owner" }, async () => app.models.Job.create({
      jobNumber: `LEGACY-${Date.now()}`, customer: { name: "Historical Customer" },
      property: { line1: "14 Oak Ridge Lane", city: "Austin", state: "TX", zip: "78701", country: "US" },
      type: "insurance", stage: "lead", createdBy: a.userId,
    }));
    expect((await app.call("GET", `/jobs/${legacy.id}`, { token: a.token })).body.property).toMatchObject({ state: "TX", zip: "78701", country: "US" });
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
  it("does not expose U.S. claim or waiver workflows for Indian jobs", async () => {
    expect((await app.call("GET", `/jobs/${jobA}/claim`, { token: a.token })).status).toBe(404);
    expect((await app.call("GET", `/jobs/${jobA}/waivers`, { token: a.token })).status).toBe(404);
    expect((await app.call("GET", "/waiver-templates", { token: a.token })).body.items).toEqual([]);
    expect((await app.call("POST", "/waiver-templates/conditional_progress/approve", { token: a.token })).status).toBe(404);
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
    expect(r.body.user.company.settings).toMatchObject({ country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", measurementSystem: "metric" });
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith("rd_refresh="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });
  it("keeps an Indian workspace INR and does not allow market reinterpretation", async () => {
    const current = await app.call("GET", "/admin/settings", { token: a.token });
    const changed = await app.call("PUT", "/admin/settings", { token: a.token, body: {
      ...current.body.settings,
      country: "US", currency: "USD", locale: "en-US", timezone: "America/Chicago", measurementSystem: "imperial",
    } });
    expect(changed.status).toBe(409);
    expect((await app.call("GET", "/admin/settings", { token: a.token })).body.settings).toMatchObject({ country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", measurementSystem: "metric" });
  });
  it("allows an existing U.S. workspace to save without changing its market", async () => {
    const legacy = await registerCompany(app, "Legacy Settings Co");
    await app.models.Company.updateOne({ _id: legacy.companyId }, { $set: { "settings.country": "US", "settings.currency": "USD", "settings.locale": "en-US", "settings.timezone": "America/Chicago", "settings.measurementSystem": "imperial" } });
    const current = await app.call("GET", "/admin/settings", { token: legacy.token });
    expect(current.body.settings).toMatchObject({ country: "US", currency: "USD", locale: "en-US", timezone: "America/Chicago", measurementSystem: "imperial" });
    const saved = await app.call("PUT", "/admin/settings", { token: legacy.token, body: current.body.settings });
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toMatchObject({ country: "US", currency: "USD", locale: "en-US", timezone: "America/Chicago", measurementSystem: "imperial" });
  });
  it("keeps pre-existing companies on U.S. defaults when their settings are absent", async () => {
    const legacy = await app.models.Company.create({ name: "Legacy U.S. Company", slug: `legacy-${Date.now()}`, settings: { paymentGating: "block", refundApprovalThresholdCents: 35000 } });
    expect(legacy.settings?.country).toBe("US");
    expect(legacy.settings?.currency).toBe("USD");
    expect(legacy.settings?.timezone).toBe("America/Chicago");
    expect(legacy.settings?.paymentGating).toBe("block");
    expect(legacy.settings?.refundApprovalThresholdCents).toBe(35000);
  });
  it("does not seed the U.S. example price catalog for an Indian company", async () => {
    const india = await app.call("GET", "/price-lists/active", { token: a.token });
    expect(india.status).toBe(200);
    expect(india.body.items).toEqual([]);
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
  it("keeps forgot-password responses generic and records a redacted reset email", async () => {
    const active = await app.call("POST", "/auth/forgot-password", { body: { email: a.email } });
    const unknown = await app.call("POST", "/auth/forgot-password", { body: { email: "unknown-reset@example.com" } });
    expect(active.status).toBe(200);
    expect(active.body).toEqual(unknown.body);
    const token = await app.models.PasswordResetToken.findOne({ userId: a.userId }).setOptions({ skipTenant: true });
    expect(token).toBeTruthy();
    expect(token!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const email = await app.models.EmailOutbox.findOne({ to: a.email, kind: "auth.password_reset" }).setOptions({ skipTenant: true });
    expect(email?.status).toBe("sent");
    expect(email?.redactedText).not.toContain("/reset-password/");
  });
  it("accepts a reset token once, changes the password, and revokes old sessions", async () => {
    const { hashToken } = await import("../src/core/auth");
    const raw = randomBytes(32).toString("base64url");
    await app.models.PasswordResetToken.create({
      userId: a.userId,
      companyId: a.companyId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const reset = await app.call("POST", "/auth/reset-password", { body: { token: raw, password: "new secure password 123" } });
    expect(reset.status).toBe(204);
    expect((await app.call("POST", "/auth/reset-password", { body: { token: raw, password: "another password 123" } })).status).toBe(400);
    expect((await app.call("POST", "/auth/login", { body: { email: a.email, password: PASSWORD } })).status).toBe(401);
    expect((await app.call("POST", "/auth/login", { body: { email: a.email, password: "new secure password 123" } })).status).toBe(200);
    expect((await app.call("POST", "/auth/refresh", { cookie: a.cookie })).status).toBe(401);
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
