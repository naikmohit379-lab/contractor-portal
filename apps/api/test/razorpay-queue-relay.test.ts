import { describe, expect, it, vi } from "vitest";
import { handleQueueBatch, handleWebhookRequest } from "../../../deploy/razorpay-webhook-queue-relay/src/index";

const companyId = "6ae49977f19016e6d6798d3d";
const sampleBody = '{"event":"payment_link.paid","synthetic":true}';
const env = {
  ROOFDESK_STAGING_API_ORIGIN: "https://staging.example.test",
  VERCEL_AUTOMATION_BYPASS_SECRET: "test-bypass-secret",
  RAZORPAY_WEBHOOK_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
};

describe("Razorpay durable webhook relay", () => {
  it("acknowledges only after enqueueing the original bytes and signature", async () => {
    const response = await handleWebhookRequest(new Request(`https://relay.example.test/razorpay/${companyId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "synthetic-signature",
        "x-razorpay-event-id": "evt_synthetic_1",
      },
      body: sampleBody,
    }), env);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, queued: true });
    const queued = env.RAZORPAY_WEBHOOK_QUEUE.send.mock.calls[0]?.[0];
    expect(queued).toMatchObject({ companyId, eventId: "evt_synthetic_1", signature: "synthetic-signature" });
    expect(new TextDecoder().decode(Uint8Array.from(atob(queued.bodyBase64), (char) => char.charCodeAt(0)))).toBe(sampleBody);
  });

  it("returns 503 when durable enqueue fails so the sender can retry", async () => {
    const failedEnv = { ...env, RAZORPAY_WEBHOOK_QUEUE: { send: vi.fn().mockRejectedValue(new Error("queue unavailable")) } };
    const response = await handleWebhookRequest(new Request(`https://relay.example.test/razorpay/${companyId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "sig", "x-razorpay-event-id": "evt_2" },
      body: sampleBody,
    }), failedEnv);
    expect(response.status).toBe(503);
  });

  it("retries temporary/API-protection failures but acknowledges invalid-signature rejections", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const body = btoa(sampleBody);
    const messages = [
      { body: { companyId, eventId: "evt_bad_sig", signature: "bad", bodyBase64: body }, ack, retry },
      { body: { companyId, eventId: "evt_upstream", signature: "sig", bodyBase64: body }, ack, retry },
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("invalid", { status: 400 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    try {
      await handleQueueBatch({ messages }, env);
    } finally {
      fetchMock.mockRestore();
    }

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });
});
