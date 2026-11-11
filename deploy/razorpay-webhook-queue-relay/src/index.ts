interface QueuedWebhook {
  companyId: string;
  eventId: string;
  signature: string;
  bodyBase64: string;
}

interface QueueBinding {
  send(message: QueuedWebhook): Promise<void>;
}

interface Env {
  ROOFDESK_STAGING_API_ORIGIN: string;
  VERCEL_AUTOMATION_BYPASS_SECRET: string;
  RAZORPAY_WEBHOOK_QUEUE: QueueBinding;
}

interface QueueMessage<T> {
  body: T;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface QueueBatch<T> {
  messages: QueueMessage<T>[];
}

const MAX_BODY_BYTES = 32 * 1024;
const COMPANY_ID_PATTERN = /^[a-f\d]{24}$/i;
const PERMANENT_REJECTION_STATUSES = new Set([400, 413, 415, 422]);

function reply(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validMessage(value: unknown): value is QueuedWebhook {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<QueuedWebhook>;
  return Boolean(
    typeof message.companyId === "string" && COMPANY_ID_PATTERN.test(message.companyId) &&
    typeof message.eventId === "string" && message.eventId.length > 0 && message.eventId.length <= 160 &&
    typeof message.signature === "string" && message.signature.length > 0 && message.signature.length <= 512 &&
    typeof message.bodyBase64 === "string" && message.bodyBase64.length <= 44_000,
  );
}

export async function handleWebhookRequest(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url);
  const match = incoming.pathname.match(/^\/razorpay\/([^/]+)$/);

  if (request.method !== "POST") return reply(405, "Method not allowed");
  if (incoming.search || incoming.hash) return reply(400, "Query parameters are not accepted");
  if (!match || !COMPANY_ID_PATTERN.test(match[1])) return reply(404, "Webhook route not found");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return reply(415, "Expected application/json");
  }
  if (!env.ROOFDESK_STAGING_API_ORIGIN || !env.VERCEL_AUTOMATION_BYPASS_SECRET || !env.RAZORPAY_WEBHOOK_QUEUE) {
    return reply(503, "Relay is not configured");
  }

  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!signature || signature.length > 512 || !eventId || eventId.length > 160) {
    return reply(400, "Required Razorpay headers are missing or invalid");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return reply(413, "Webhook body too large");
  let body: Uint8Array | null;
  try {
    body = await readBoundedBody(request);
  } catch {
    return reply(400, "Could not read webhook body");
  }
  if (!body) return reply(413, "Webhook body too large");

  try {
    await env.RAZORPAY_WEBHOOK_QUEUE.send({
      companyId: match[1],
      eventId,
      signature,
      bodyBase64: encodeBase64(body),
    });
  } catch {
    // A 5xx asks Razorpay to retry if the durable queue write fails.
    return reply(503, "Could not durably queue webhook");
  }

  // This confirms durable enqueue only. Roofora applies the event asynchronously after signature validation.
  return Response.json({ accepted: true, queued: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

export async function handleQueueBatch(batch: QueueBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    if (!validMessage(message.body)) {
      message.ack();
      continue;
    }

    let target: URL;
    try {
      target = new URL(`/api/v1/webhooks/razorpay/${message.body.companyId}`, env.ROOFDESK_STAGING_API_ORIGIN);
      if (target.protocol !== "https:") {
        message.retry({ delaySeconds: 30 });
        continue;
      }
    } catch {
      message.retry({ delaySeconds: 30 });
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const rawBody = decodeBase64(message.body.bodyBase64);
      const requestBody = rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer;
      const upstream = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": message.body.signature,
          "x-razorpay-event-id": message.body.eventId,
          "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET,
          "user-agent": "Roofora-Razorpay-Webhook-Queue/1.0",
        },
        body: requestBody,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      await upstream.body?.cancel();

      if (upstream.status >= 200 && upstream.status < 300) {
        message.ack();
      } else if (PERMANENT_REJECTION_STATUSES.has(upstream.status)) {
        // Invalid signatures and malformed events cannot succeed on retry; do not retry poison messages.
        message.ack();
      } else {
        // Includes redirects, protection/auth failures, rate limits, and transient upstream errors.
        message.retry({ delaySeconds: 30 });
      }
    } catch {
      message.retry({ delaySeconds: 30 });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default {
  fetch: handleWebhookRequest,
  queue: handleQueueBatch,
};
