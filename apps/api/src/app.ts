import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { env } from "./config/env";
import { AppError, notFound } from "./core/errors";
import { logger } from "./core/logger";
import { sanitize } from "./core/sanitize";
import { authRouter } from "./modules/auth/auth.routes";
import { jobsRouter } from "./modules/jobs/jobs.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { pricingRouter } from "./modules/pricing/pricing.routes";
import { eventsRouter } from "./modules/notifications/events.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { cronRouter } from "./modules/notifications/cron.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
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
import { operationsRouter } from "./modules/operations/operations.routes";
import { teamRouter } from "./modules/team/team.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { Job } from "./models/Job";
import { requireAuth } from "./core/auth";
import { asyncHandler } from "./core/http";

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

  // "health": the process is up. "ready": it can also reach the database (what a load balancer should check).
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/ready", (_req, res) => (mongoose.connection.readyState === 1 ? res.json({ ok: true }) : res.status(503).json({ ok: false })));

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  // Operations Interns can read only jobs explicitly assigned to them, including nested job resources.
  v1.use("/jobs/:jobId", requireAuth, asyncHandler(async (req, _res, next) => {
    if (req.auth?.role !== "operations" || !isValidObjectId(req.params.jobId)) return next();
    const job = await Job.findOne({ _id: req.params.jobId, assigneeIds: req.auth.userId }).select("_id");
    if (!job) throw notFound("Assigned job");
    next();
  }));
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
  v1.use("/events", eventsRouter);
  v1.use("/notifications", notificationsRouter);
  v1.use("/cron", cronRouter);
  v1.use("/reports", reportsRouter);
  v1.use("/operations", operationsRouter);
  v1.use("/team", teamRouter);
  v1.use("/admin", adminRouter);
  v1.use("/jobs/:jobId/documents", documentsRouter);
  v1.use("/price-lists", pricingRouter);
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
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: { code: "too_large", message: "That file is too large. The limit is 15 MB." } });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "bad_json", message: "The request could not be read" } });
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
