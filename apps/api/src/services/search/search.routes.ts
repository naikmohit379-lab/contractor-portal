import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/auth";
import { asyncHandler } from "../../core/http";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";

export const searchRouter = Router();

const querySchema = z.object({ q: z.string().trim().min(2).max(80) });
const escapeRegex = (value: string) => value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

searchRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { q } = querySchema.parse(req.query);
  const pattern = new RegExp(escapeRegex(q), "i");
  const assignedOnly = req.auth!.role === "operations";
  const assignment = assignedOnly ? { assigneeIds: req.auth!.userId } : {};

  const jobs = await Job.find({
    ...assignment,
    $or: [
      { jobNumber: pattern },
      { "customer.name": pattern },
      { "customer.email": pattern },
      { "customer.phone": pattern },
      { "property.line1": pattern },
      { "property.line2": pattern },
      { "property.city": pattern },
      { "property.locality": pattern },
      { "property.district": pattern },
      { "property.state": pattern },
      { "property.pinCode": pattern },
      { "property.zip": pattern },
    ],
  }).select("jobNumber customer property stage updatedAt").sort({ updatedAt: -1 }).limit(8).lean();

  const permittedJobIds = assignedOnly
    ? (await Job.find({ assigneeIds: req.auth!.userId }).select("_id").lean()).map((job) => job._id)
    : undefined;
  const documents = await Document.find({
    ...(permittedJobIds ? { jobId: { $in: permittedJobIds } } : {}),
    $or: [{ filename: pattern }, { caption: pattern }, { tags: pattern }],
  }).select("jobId kind filename caption tags updatedAt").sort({ updatedAt: -1 }).limit(8).lean();

  const relatedJobs = documents.length
    ? await Job.find({ _id: { $in: documents.map((doc) => doc.jobId) } }).select("jobNumber customer").lean()
    : [];
  const jobById = new Map(relatedJobs.map((job) => [String(job._id), job]));

  res.json({
    jobs: jobs.map((job) => ({
      id: String(job._id),
      jobNumber: job.jobNumber,
      customerName: job.customer?.name ?? "",
      address: [job.property?.line1, job.property?.locality || job.property?.city, job.property?.state, job.property?.pinCode || job.property?.zip].filter(Boolean).join(", "),
      stage: job.stage,
    })),
    documents: documents.flatMap((doc) => {
      const job = jobById.get(String(doc.jobId));
      return job ? [{
        id: String(doc._id),
        jobId: String(doc.jobId),
        jobNumber: job.jobNumber,
        customerName: job.customer?.name ?? "",
        filename: doc.filename,
        kind: doc.kind,
        caption: doc.caption ?? "",
        tags: doc.tags,
      }] : [];
    }),
  });
}));