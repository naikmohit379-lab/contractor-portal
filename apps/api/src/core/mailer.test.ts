import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: any[] = [];
const logs: any[] = [];
const cfg = vi.hoisted(() => ({ env: { EMAIL_PROVIDER: "log", EMAIL_FROM: "x", RESEND_API_KEY: undefined as string | undefined }, isProd: true }));

vi.mock("../config/env", () => cfg);
vi.mock("../models/EmailOutbox", () => ({ EmailOutbox: { create: async (d: any) => void stored.push(d) } }));
vi.mock("./logger", () => ({ logger: { info: (o: any) => logs.push(o), error: () => {} } }));

import { sendEmail, sendLinkEmail, textToHtml } from "./mailer";

beforeEach(() => { stored.length = 0; logs.length = 0; cfg.env.EMAIL_PROVIDER = "log"; cfg.env.RESEND_API_KEY = undefined; });

describe("email", () => {
  it("never stores or logs a secure link", async () => {
    const ok = await sendLinkEmail({ companyId: "c1", to: "a@b.com", kind: "waiver.link", subject: "S", intro: "Please sign", url: "https://app.example.com/sign/AbC_123-xyz?x=1" });
    expect(ok).toBe(true);
    expect(stored[0].redactedText).not.toContain("AbC_123");
    expect(stored[0].redactedText).toContain("[secure link]");
    expect(JSON.stringify(logs)).not.toContain("AbC_123");
    await sendLinkEmail({ companyId: "c1", to: "a@b.com", kind: "k", subject: "S", intro: "i", url: "https://x.io/pay/ZZZ999" });
    await sendLinkEmail({ companyId: "c1", to: "a@b.com", kind: "k", subject: "S", intro: "i", url: "https://x.io/confirm/QQQ111" });
    expect(stored[1].redactedText).not.toContain("ZZZ999");
    expect(stored[2].redactedText).not.toContain("QQQ111");
  });
  it("keeps ordinary app links", async () => {
    await sendEmail({ companyId: "c1", to: "a@b.com", kind: "payment.succeeded", subject: "S", text: "Open it: https://app.example.com/jobs/123?tab=payments" });
    expect(stored[0].redactedText).toContain("/jobs/123?tab=payments");
  });
  it("records a failure instead of throwing", async () => {
    cfg.env.EMAIL_PROVIDER = "resend";
    const ok = await sendEmail({ companyId: "c1", to: "a@b.com", kind: "k", subject: "S", text: "t" });
    expect(ok).toBe(false);
    expect(stored[0].status).toBe("failed");
    expect(stored[0].error).toMatch(/RESEND_API_KEY/);
  });
  it("escapes html and links urls", () => {
    const h = textToHtml('<script>alert(1)</script> & https://x.com/a\n\nSecond "para"');
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain('<a href="https://x.com/a">');
    expect(h.split("<p>").length).toBe(3);
  });
});
