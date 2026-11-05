import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/auth";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { AuditLog } from "../../models/AuditLog";
import { Claim } from "../../models/Claim";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";
import { OperationsTask } from "../../models/OperationsTask";
import { Payment } from "../../models/Payment";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { User } from "../../models/User";
import { Waiver } from "../../models/Waiver";
import { Company } from "../../models/Company";
import { PriceList } from "../../models/PriceList";
import { Supplier } from "../../models/Supplier";
import { encryptRazorpaySecret } from "../payments/razorpay";
import { env } from "../../config/env";
import { companyMarketSettingsSchema, jobStageLabelsSchema, normalizeMarketSettings } from "@roofdesk/shared";
import { normalizeStageLabels } from "../jobs/stages";

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePermission("user:manage"));

const razorpayTestCredentialsSchema = z.object({
  keyId: z.string().trim().min(12).max(100).regex(/^rzp_test_[A-Za-z0-9]+$/, "Use a Razorpay Test Mode Key ID (starts with rzp_test_)") ,
  keySecret: z.string().min(8).max(300),
  webhookSecret: z.string().min(8).max(300),
});

adminRouter.get("/razorpay-test", asyncHandler(async (req, res) => {
  const company = await Company.findById(req.auth!.companyId).select("+settings.razorpayTest.encryptedKeySecret +settings.razorpayTest.encryptedWebhookSecret");
  if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
  res.json({
    enabled: env.RAZORPAY_API_ENABLED,
    configured: Boolean(company.settings?.razorpayTest?.keyId && company.settings?.razorpayTest?.encryptedKeySecret && company.settings?.razorpayTest?.encryptedWebhookSecret),
    keyIdHint: company.settings?.razorpayTest?.keyId ? `${company.settings.razorpayTest.keyId.slice(0, 12)}…` : undefined,
    webhookUrl: env.PUBLIC_API_URL ? `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/v1/webhooks/razorpay/${company.id}` : `/api/v1/webhooks/razorpay/${company.id}`,
  });
}));

adminRouter.put("/razorpay-test", validate({ body: razorpayTestCredentialsSchema }), asyncHandler(async (req, res) => {
  if (!env.RAZORPAY_API_ENABLED || !env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY) {
    return res.status(503).json({ error: { code: "razorpay_test_disabled", message: "Razorpay Test API connections are disabled by the server configuration" } });
  }
  const company = await Company.findById(req.auth!.companyId);
  if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
  if (company.settings?.country !== "IN" || company.settings?.currency !== "INR") {
    return res.status(409).json({ error: { code: "india_only", message: "Connect a Razorpay account only to an India/INR workspace" } });
  }
  company.set("settings.razorpayTest.keyId", req.body.keyId);
  company.set("settings.razorpayTest.encryptedKeySecret", encryptRazorpaySecret(req.body.keySecret));
  company.set("settings.razorpayTest.encryptedWebhookSecret", encryptRazorpaySecret(req.body.webhookSecret));
  company.set("settings.razorpayTest.configuredAt", new Date());
  await company.save();
  await AuditLog.create({ actorId: req.auth!.userId, action: "company.razorpay_test_connected", entity: "Company", entityId: company._id, meta: { mode: "test" } });
  res.json({ configured: true, keyIdHint: `${req.body.keyId.slice(0, 12)}…`, webhookUrl: env.PUBLIC_API_URL ? `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/v1/webhooks/razorpay/${company.id}` : `/api/v1/webhooks/razorpay/${company.id}` });
}));

adminRouter.delete("/razorpay-test", asyncHandler(async (req, res) => {
  const company = await Company.findById(req.auth!.companyId);
  if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
  company.set("settings.razorpayTest", undefined);
  await company.save();
  await AuditLog.create({ actorId: req.auth!.userId, action: "company.razorpay_test_disconnected", entity: "Company", entityId: company._id, meta: { mode: "test" } });
  res.json({ configured: false });
}));

adminRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings");
    if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
    res.json({ settings: {
      ...normalizeMarketSettings(company.settings as any),
      paymentGating: company.settings?.paymentGating ?? "warn",
      refundApprovalThresholdCents: company.settings?.refundApprovalThresholdCents ?? 100000,
      stageLabels: normalizeStageLabels(company.settings?.stageLabels),
    } });
  }),
);

const legacyUSMarketSettingsSchema = z.object({
  country: z.literal("US"),
  currency: z.literal("USD"),
  locale: z.literal("en-US"),
  language: z.enum(["en", "hi"]),
  timezone: z.literal("America/Chicago"),
  measurementSystem: z.literal("imperial"),
});
const companySettingsSchema = z.union([companyMarketSettingsSchema, legacyUSMarketSettingsSchema]).and(z.object({
  paymentGating: z.enum(["warn", "block"]),
  refundApprovalThresholdCents: z.number().int().min(0).max(100_000_000),
  stageLabels: jobStageLabelsSchema,
}));

adminRouter.put(
  "/settings",
  validate({ body: companySettingsSchema }),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId);
    if (!company) return res.status(404).json({ error: { code: "not_found", message: "Company not found" } });
    const before = {
      ...normalizeMarketSettings(company.settings as any),
      paymentGating: company.settings?.paymentGating ?? "warn",
      refundApprovalThresholdCents: company.settings?.refundApprovalThresholdCents ?? 100000,
      stageLabels: normalizeStageLabels(company.settings?.stageLabels),
    };
    const marketChanged = req.body.country !== before.country || req.body.currency !== before.currency;
    if (marketChanged) {
      return res.status(409).json({ error: { code: "market_locked", message: "A company’s country and currency are fixed at registration so existing records are never reinterpreted. Create a separate company for an India workspace." } });
    }
    for (const key of ["country", "currency", "locale", "language", "timezone", "measurementSystem"] as const) {
      company.set(`settings.${key}`, req.body[key]);
    }
    company.set("settings.paymentGating", req.body.paymentGating);
    company.set("settings.refundApprovalThresholdCents", req.body.refundApprovalThresholdCents);
    company.set("settings.stageLabels", req.body.stageLabels);
    await company.save();
    const after = {
      country: req.body.country as "IN" | "US",
      currency: req.body.currency as "INR" | "USD",
      locale: req.body.locale as "en-IN" | "hi-IN" | "en-US",
      language: req.body.language as "en" | "hi",
      timezone: req.body.timezone as string,
      measurementSystem: req.body.measurementSystem as "metric" | "imperial",
      paymentGating: req.body.paymentGating as "warn" | "block",
      refundApprovalThresholdCents: req.body.refundApprovalThresholdCents as number,
      stageLabels: req.body.stageLabels,
    };
    await AuditLog.create({
      actorId: req.auth!.userId,
      action: "company.settings_updated",
      entity: "Company",
      entityId: company._id,
      meta: { before, after },
    });
    res.json({ settings: after });
  }),
);

/** Company-wide operational snapshot for owners and admins; excludes payment details and audit metadata. */
adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [jobs, activeClaims, openWaivers, flaggedPayments, lateOrders, overdueTasks, activeUsers, recentJobs, activity, documentJobRows] = await Promise.all([
      Job.countDocuments(),
      Claim.countDocuments({ status: { $in: ["submitted", "inspection_scheduled", "supplement_filed"] } }),
      Waiver.countDocuments({ status: { $in: ["requested", "viewed"] } }),
      Payment.countDocuments({ $or: [{ flag: { $exists: true, $ne: "" } }, { status: "failed" }, { disputed: true }] }),
      PurchaseOrder.countDocuments({ status: { $in: ["scheduled", "partially_delivered", "backordered"] }, "deliveryWindow.date": { $lt: now } }),
      OperationsTask.countDocuments({ status: { $in: ["open", "blocked"] }, dueAt: { $lt: now } }),
      User.countDocuments({ status: "active" }),
      Job.find().sort({ updatedAt: -1 }).limit(6).select("jobNumber customer.name property.line1 property.line2 property.locality property.city property.district property.state property.zip property.pinCode property.country stage updatedAt"),
      AuditLog.find().sort({ at: -1 }).limit(8).select("actorId action entity entityId at").populate<{ actorId: { name: string } | null }>("actorId", "name"),
      Document.aggregate([{ $group: { _id: "$jobId" } }]),
    ]);

    const jobIdsWithDocuments = documentJobRows.map((row: { _id: unknown }) => row._id);
    const missingDocuments = await Job.countDocuments({ _id: { $nin: jobIdsWithDocuments } });

    res.json({
      generatedAt: now.toISOString(),
      counts: { jobs, activeClaims, openWaivers, flaggedPayments, lateOrders, overdueTasks, activeUsers, missingDocuments },
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customer?.name ?? "Customer",
        address: [job.property?.line1, job.property?.line2, job.property?.locality, job.property?.city, job.property?.district, job.property?.state, job.property?.country === "IN" ? job.property?.pinCode : job.property?.zip].filter(Boolean).join(", "),
        stage: job.stage,
        updatedAt: job.updatedAt.toISOString(),
      })),
      activity: activity.map((entry) => ({
        id: entry.id,
        actorName: entry.actorId?.name ?? "Former user",
        action: entry.action,
        entity: entry.entity,
        entityId: String(entry.entityId),
        at: entry.at.toISOString(),
      })),
    });
  }),
);
