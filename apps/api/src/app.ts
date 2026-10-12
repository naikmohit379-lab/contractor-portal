import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { env } from "./config/env";
import { AppError } from "./core/errors";
import { logger } from "./core/logger";
import { sanitize } from "./core/sanitize";
import { authRouter } from "./modules/auth/auth.routes";
import { jobsRouter } from "./modules/jobs/jobs.routes";
import { claimsRouter } from "./modules/claims/claims.routes";
import { estimatesRouter } from "./modules/estimates/estimates.routes";
import { measurementsRouter } from "./modules/measurements/measurements.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { publicRouter } from "./modules/orders/public.routes";
import { companyPaymentsRouter, paymentsRouter } from "./modules/payments/payments.routes";
import { publicPaymentsRouter } from "./modules/payments/public.routes";
import { stripeWebhookHandler } from "./modules/payments/webhook.routes";
import { suppliersRouter } from "./modules/suppliers/suppliers.routes";
import { milestonesRouter } from "./modules/waivers/milestones.routes";
import { partiesRouter } from "./modules/waivers/parties.routes";
import { signRouter } from "./modules/waivers/sign.routes";
import { templatesRouter } from "./modules/waivers/templates.routes";
import { waiversRouter } from "./modules/waivers/waivers.routes";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(pinoHttp({ logger }));
  // The gateway signs the raw bytes, so this route must be registered before the JSON parser.
  app.post("/api/v1/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhookHandler);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/jobs", jobsRouter);
  v1.use("/jobs/:jobId/measurements", measurementsRouter);
  v1.use("/jobs/:jobId/estimate", estimatesRouter);
  v1.use("/jobs/:jobId/claim", claimsRouter);
  v1.use("/jobs/:jobId/orders", ordersRouter);
  v1.use("/suppliers", suppliersRouter);
  v1.use("/jobs/:jobId/parties", partiesRouter);
  v1.use("/jobs/:jobId/milestones", milestonesRouter);
  v1.use("/jobs/:jobId/waivers", waiversRouter);
  v1.use("/waiver-templates", templatesRouter);
  v1.use("/public", publicRouter);
  v1.use("/public", signRouter);
  v1.use("/public", publicPaymentsRouter);
  v1.use("/jobs/:jobId/payments", paymentsRouter);
  v1.use("/payments", companyPaymentsRouter);
  app.use("/api/v1", v1);

  app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "Route not found" } }));

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(422).json({
        error: { code: "validation_failed", message: "Check the highlighted fields", details: err.flatten().fieldErrors },
      });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: { code: "duplicate", message: "This record already exists" } });
    }
    req.log.error({ err }, "unhandled error");
    res.status(500).json({ error: { code: "internal", message: "Something went wrong on our side. Try again." } });
  };
  app.use(errorHandler);

  return app;
}
