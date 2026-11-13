import { Client } from "@upstash/qstash";
import { env } from "../../config/env";

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
  } catch {
    // Never attach the QStash client/request object to an error or log line.
    throw new Error("QStash did not accept the measurement job");
  }
}
