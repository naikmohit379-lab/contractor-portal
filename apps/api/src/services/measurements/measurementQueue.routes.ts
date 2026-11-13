import type { Request, Response } from "express";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../core/logger";
import { processQueuedMeasurementReport } from "./measurements.routes";
import { getMeasurementQueueReceiverKeys, MEASUREMENT_QUEUE_PATH } from "./measurementQueue";

const messageSchema = z.object({ reportId: z.string().regex(/^[a-f\d]{24}$/i), jobKey: z.string().min(1).max(200) }).strict();

/** QStash callback. The raw body and exact configured URL are verified before parsing. */
export async function measurementQueueHandler(req: Request, res: Response): Promise<void> {
  const keys = getMeasurementQueueReceiverKeys();
  const callbackUrl = env.MEASUREMENT_QUEUE_CALLBACK_URL;
  if (!keys || !callbackUrl) {
    res.status(503).json({ error: { code: "measurement_queue_disabled", message: "Measurement queue is not enabled." } });
    return;
  }
  if (new URL(callbackUrl).pathname !== MEASUREMENT_QUEUE_PATH) {
    res.status(503).json({ error: { code: "measurement_queue_misconfigured", message: "Measurement queue callback URL has an invalid path." } });
    return;
  }

  const signature = req.header("Upstash-Signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(401).json({ error: { code: "invalid_queue_signature", message: "Queue signature is required." } });
    return;
  }

  try {
    const receiver = new Receiver(keys);
    const valid = await receiver.verify({ signature, body: req.body.toString("utf8"), url: callbackUrl });
    if (!valid) {
      res.status(401).json({ error: { code: "invalid_queue_signature", message: "Queue signature is invalid." } });
      return;
    }
  } catch {
    logger.warn({ route: MEASUREMENT_QUEUE_PATH }, "measurement queue signature verification failed");
    res.status(401).json({ error: { code: "invalid_queue_signature", message: "Queue signature is invalid." } });
    return;
  }

  let payload: unknown;
  try { payload = JSON.parse(req.body.toString("utf8")); }
  catch {
    res.status(400).set("Upstash-NonRetryable-Error", "true").json({ error: { code: "invalid_queue_message", message: "Queue message is not valid JSON." } });
    return;
  }
  const parsed = messageSchema.safeParse(payload);
  if (!parsed.success) {
    res.status(400).set("Upstash-NonRetryable-Error", "true").json({ error: { code: "invalid_queue_message", message: "Queue message is invalid." } });
    return;
  }

  try {
    const result = await processQueuedMeasurementReport(parsed.data.reportId, parsed.data.jobKey);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    logger.warn({ err: error, reportId: parsed.data.reportId }, "measurement queue job will be retried");
    res.status(503).json({ error: { code: "measurement_processing_retry", message: "Measurement report is still processing; retry the queued job." } });
  }
}
