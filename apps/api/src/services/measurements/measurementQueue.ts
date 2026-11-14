import { Client } from "@upstash/qstash";
import { env } from "../../config/env";
import { logger } from "../../core/logger";

export const MEASUREMENT_QUEUE_NAME = "roofora-measurements";
export const MEASUREMENT_QUEUE_PATH = "/api/v1/internal/measurements/process";
let queueReady: Promise<void> | undefined;

export function isMeasurementQueueConfigured(): boolean {
  const callbackUrl = env.MEASUREMENT_QUEUE_CALLBACK_URL;
  return env.MEASUREMENT_QUEUE_ENABLED
    && Boolean(env.QSTASH_TOKEN)
    && Boolean(env.QSTASH_CURRENT_SIGNING_KEY)
    && Boolean(env.QSTASH_NEXT_SIGNING_KEY)
    && Boolean(callbackUrl?.startsWith("https://"))
    && new URL(callbackUrl!).pathname === MEASUREMENT_QUEUE_PATH;
}

export function getMeasurementQueueReceiverKeys() {
  if (!isMeasurementQueueConfigured()) return undefined;
  return {
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY!,
  };
}

/** Keep provider diagnostics useful without logging credentials, URLs, or request payloads. */
export function getMeasurementQueueFailureDetails(error: unknown): { status?: number; reason: string } {
  const candidate = error && typeof error === "object" ? error as { status?: unknown; message?: unknown } : {};
  const status = typeof candidate.status === "number" && Number.isInteger(candidate.status)
    ? candidate.status
    : undefined;
  let reason = typeof candidate.message === "string" ? candidate.message : "Unknown QStash error";

  try {
    const parsed: unknown = JSON.parse(reason);
    if (parsed && typeof parsed === "object") {
      const body = parsed as Record<string, unknown>;
      const detail = [body.error, body.message, body.detail, body.reason]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
      if (detail) reason = detail;
    }
  } catch {
    // Non-JSON provider messages are useful as-is after sanitization below.
  }

  const secrets = [env.QSTASH_TOKEN, env.QSTASH_CURRENT_SIGNING_KEY, env.QSTASH_NEXT_SIGNING_KEY,
    env.VERCEL_AUTOMATION_BYPASS_SECRET].filter((value): value is string => Boolean(value));
  for (const secret of secrets) reason = reason.split(secret).join("[redacted]");
  reason = reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);

  return { ...(status === undefined ? {} : { status }), reason: reason || "QStash rejected the request" };
}

/** Enqueue a read/refresh of an already ordered report; this never orders a new RoofV measurement. */
export async function enqueueMeasurementReport(reportId: string, jobKey: string): Promise<void> {
  if (!isMeasurementQueueConfigured()) throw new Error("Measurement background queue is not configured");
  const client = new Client({ token: env.QSTASH_TOKEN! });
  const queue = client.queue({ queueName: MEASUREMENT_QUEUE_NAME });
  try {
    queueReady ??= queue.upsert({ parallelism: 1 }).then(() => undefined).catch((error) => {
      queueReady = undefined;
      throw error;
    });
    await queueReady;
    await queue.enqueueJSON({
      url: env.MEASUREMENT_QUEUE_CALLBACK_URL!,
      body: { reportId, jobKey },
      headers: env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : undefined,
      // QStash must forward the bypass header, but must not display it in its message logs.
      redact: env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { header: ["x-vercel-protection-bypass"] }
        : undefined,
      retries: 3,
      label: ["roofora", "roofv-report"],
      deduplicationId: jobKey,
    });
  } catch (error) {
    const details = getMeasurementQueueFailureDetails(error);
    // Do not log the SDK error object: it may contain request details or credentials.
    logger.error({ ...details, reportId }, "QStash rejected the measurement job");
    throw new Error("QStash did not accept the measurement job");
  }
}
