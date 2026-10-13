import { env, isProd } from "../config/env";
import { EmailOutbox } from "../models/EmailOutbox";
import { logger } from "./logger";

const SECURE_LINK = /https?:\/\/[^\s]*\/(?:sign|pay|confirm)\/[A-Za-z0-9_\-]+[^\s]*/g;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Plain text to simple HTML: paragraphs, and links become clickable. All other text is escaped. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface EmailInput {
  companyId: unknown;
  to: string;
  subject: string;
  text: string;
  kind: string;
}

/**
 * Sends one email and records it. Never throws: a failed email must not break the action that triggered it.
 * Returns true if the provider accepted it.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  let ok = false;
  let error: string | undefined;
  try {
    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, text: input.text, html: textToHtml(input.text) }),
      });
      if (!res.ok) throw new Error(`Email provider answered ${res.status}`);
    } else {
      // Development: print the message. In production the log copy hides secure links too.
      logger.info({ to: input.to, subject: input.subject, text: isProd ? input.text.replace(SECURE_LINK, "[secure link]") : input.text }, "email (log provider)");
      if (isProd) error = "The log provider does not deliver email in production; configure Resend.";
      else ok = true;
    }
    if (env.EMAIL_PROVIDER === "resend") ok = true;
  } catch (e: any) {
    error = String(e?.message ?? e).slice(0, 300);
    logger.error({ err: e, to: input.to }, "email failed");
  }
  try {
    await EmailOutbox.create({
      companyId: input.companyId,
      to: input.to,
      subject: input.subject,
      kind: input.kind,
      redactedText: input.text.replace(SECURE_LINK, "[secure link]"),
      status: ok ? "sent" : "failed",
      error,
    });
  } catch (e) {
    logger.error({ err: e }, "could not record email");
  }
  return ok;
}

/** An email whose job is to deliver one secure link (to sign, pay or confirm). */
export const sendLinkEmail = (o: { companyId: unknown; to: string; kind: string; subject: string; intro: string; url: string }) =>
  sendEmail({ companyId: o.companyId, to: o.to, kind: o.kind, subject: o.subject, text: `${o.intro}\n\n${o.url}\n\nThis link is for you only. If you were not expecting this email, you can ignore it.` });
