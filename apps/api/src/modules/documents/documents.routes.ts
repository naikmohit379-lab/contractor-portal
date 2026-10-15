import { createHash } from "node:crypto";
import express, { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, documentUpdateSchema, type DocumentDTO, type DocumentVersionDTO } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { AppError, notFound } from "../../core/errors";
import { logger } from "../../core/logger";
import { touchJob } from "../../core/notify";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { Document } from "../../models/Document";
import { Job } from "../../models/Job";
import { PurchaseOrder } from "../../models/PurchaseOrder";
import { cleanFilename, detectFileType } from "./fileType";
import { newStorageKey } from "./storage";
import { getStorage } from "./storageFactory";

export const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(requireAuth);

const jobParam = z.object({ jobId: z.string().refine(isValidObjectId, "Invalid job id") });
const docParam = jobParam.extend({ docId: z.string().refine(isValidObjectId, "Invalid document id") });

export const toDocumentDTO = (d: any): DocumentDTO => ({
  id: d.id,
  jobId: String(d.jobId),
  filename: d.filename,
  contentType: d.contentType,
  sizeBytes: d.sizeBytes,
  sha256: d.sha256,
  kind: d.kind,
  version: (d.versions?.length ?? 0) + 1,
  tags: d.tags ?? [],
  slope: d.slope ?? undefined,
  caption: d.caption ?? undefined,
  includeInPacket: d.includeInPacket,
  annotations: (d.annotations ?? []).map((a: any) => ({ id: a.id, x: a.x, y: a.y, kind: a.kind, note: a.note ?? undefined })),
  createdAt: d.createdAt.toISOString(),
});

documentsRouter.get(
  "/",
  requirePermission("job:read"),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const items = await Document.find({ jobId: req.params.jobId }).sort({ createdAt: -1 });
    res.json({ items: items.map(toDocumentDTO) });
  }),
);

documentsRouter.get(
  "/:docId/versions",
  requirePermission("job:read"),
  validate({ params: docParam }),
  asyncHandler(async (req, res) => {
    const doc = await Document.findOne({ _id: req.params.docId, jobId: req.params.jobId });
    if (!doc) throw notFound("Document");
    const history: DocumentVersionDTO[] = (doc.versions ?? []).map((version: any) => ({
      version: version.version,
      filename: version.filename,
      contentType: version.contentType,
      sizeBytes: version.sizeBytes,
      sha256: version.sha256,
      uploadedBy: version.uploadedBy ? String(version.uploadedBy) : undefined,
      createdAt: version.createdAt.toISOString(),
      current: false,
    }));
    history.push({
      version: history.length + 1,
      filename: doc.filename,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      sha256: doc.sha256,
      uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : undefined,
      createdAt: (doc.currentVersionAt ?? doc.createdAt).toISOString(),
      current: true,
    });
    res.json({ items: history.reverse() });
  }),
);

/**
 * Upload: the browser sends the raw file as the request body (not multipart), with the name in X-File-Name.
 * The server checks the size, identifies the type from the file's own bytes, stores it under a key it makes up,
 * and records a SHA-256 of the bytes. The browser's claimed type and the file name are never trusted.
 */
documentsRouter.post(
  "/",
  requirePermission("job:write"),
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  validate({ params: jobParam }),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);
    if (!job) throw notFound("Job");
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError(422, "empty_file", "No file was received");

    const type = detectFileType(body);
    if (!type) throw new AppError(415, "unsupported_type", "Only JPEG, PNG, WebP, HEIC photos and PDF files can be uploaded");

    const key = newStorageKey(req.auth!.companyId, job.id, type.ext);
    await getStorage().put(key, body, type.contentType);
    try {
      const doc = await Document.create({
        jobId: job._id,
        kind: type.kind,
        filename: cleanFilename(req.header("x-file-name")),
        contentType: type.contentType,
        sizeBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        storageKey: key,
        uploadedBy: req.auth!.userId,
      });
      await audit(req, "document.uploaded", "Document", doc._id, { filename: doc.filename, bytes: doc.sizeBytes });
      touchJob(req.auth!.companyId, job.id, "documents");
      res.status(201).json(toDocumentDTO(doc));
    } catch (err) {
      await getStorage().delete(key).catch(() => undefined); // do not leave an orphaned file behind
      throw err;
    }
  }),
);

documentsRouter.post(
  "/:docId/versions",
  requirePermission("job:write"),
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  validate({ params: docParam }),
  asyncHandler(async (req, res) => {
    const doc = await Document.findOne({ _id: req.params.docId, jobId: req.params.jobId });
    if (!doc) throw notFound("Document");
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError(422, "empty_file", "No file was received");
    const type = detectFileType(body);
    if (!type) throw new AppError(415, "unsupported_type", "Only JPEG, PNG, WebP, HEIC photos and PDF files can be uploaded");
    if (type.kind !== doc.kind) throw new AppError(422, "document_kind_mismatch", "A new version must be the same kind of file as the original");

    const storageKey = newStorageKey(req.auth!.companyId, doc.jobId.toString(), type.ext);
    await getStorage().put(storageKey, body, type.contentType);
    let persisted = false;
    try {
      const previousVersion = (doc.versions?.length ?? 0) + 1;
      doc.versions.push({
        version: previousVersion,
        filename: doc.filename,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        storageKey: doc.storageKey,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.currentVersionAt ?? doc.createdAt,
      } as any);
      doc.filename = cleanFilename(req.header("x-file-name"));
      doc.contentType = type.contentType;
      doc.sizeBytes = body.length;
      doc.sha256 = createHash("sha256").update(body).digest("hex");
      doc.storageKey = storageKey;
      doc.uploadedBy = req.auth!.userId as any;
      doc.currentVersionAt = new Date();
      // Damage markers refer to pixel locations on the previous image and must not carry forward.
      if (type.kind === "photo") doc.set("annotations", []);
      await doc.save();
      persisted = true;
      const version = previousVersion + 1;
      await audit(req, "document.version_uploaded", "Document", doc._id, { version, filename: doc.filename, bytes: doc.sizeBytes });
      touchJob(req.auth!.companyId, doc.jobId.toString(), "documents");
      res.status(201).json(toDocumentDTO(doc));
    } catch (err) {
      if (!persisted) await getStorage().delete(storageKey).catch(() => undefined);
      throw err;
    }
  }),
);

documentsRouter.patch(
  "/:docId",
  requirePermission("job:write"),
  validate({ params: docParam, body: documentUpdateSchema }),
  asyncHandler(async (req, res) => {
    const d = await Document.findOne({ _id: req.params.docId, jobId: req.params.jobId });
    if (!d) throw notFound("Document");
    const { annotations, ...rest } = req.body;
    Object.assign(d, rest);
    if (annotations) d.set("annotations", annotations);
    await d.save();
    await audit(req, "document.updated", "Document", d._id);
    touchJob(req.auth!.companyId, req.params.jobId, "documents");
    res.json(toDocumentDTO(d));
  }),
);

/** The file itself. Always sent with a locked-down policy so an uploaded file can never run as a page. */
documentsRouter.get(
  "/:docId/file",
  requirePermission("job:read"),
  validate({ params: docParam, query: z.object({ version: z.coerce.number().int().min(1).optional() }) }),
  asyncHandler(async (req, res) => {
    const d = await Document.findOne({ _id: req.params.docId, jobId: req.params.jobId });
    if (!d) throw notFound("Document");
    const requestedVersion = req.query.version as number | undefined;
    const currentVersion = (d.versions?.length ?? 0) + 1;
    const oldVersion = requestedVersion && requestedVersion < currentVersion
      ? d.versions?.find((version: any) => version.version === requestedVersion)
      : undefined;
    if (requestedVersion && requestedVersion !== currentVersion && !oldVersion) throw notFound("Document version");
    const file = oldVersion ?? d;
    const bytes = await getStorage().get(file.storageKey);
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(bytes);
  }),
);

documentsRouter.delete(
  "/:docId",
  requirePermission("job:write"),
  validate({ params: docParam }),
  asyncHandler(async (req, res) => {
    const d = await Document.findOne({ _id: req.params.docId, jobId: req.params.jobId });
    if (!d) throw notFound("Document");
    if (await PurchaseOrder.exists({ "supplierInvoice.documentId": d._id })) {
      throw new AppError(409, "invoice_linked", "This PDF is attached to a supplier invoice and cannot be deleted from the document library.");
    }
    const storageKeys = [d.storageKey, ...(d.versions ?? []).map((version: any) => version.storageKey)];
    await d.deleteOne();
    // The record goes first. If removing files fails, stray objects are harmless; a record pointing at nothing is not.
    await Promise.all(storageKeys.map((key) => getStorage().delete(key).catch((err) => logger.error({ err, key }, "could not delete stored file"))));
    await audit(req, "document.deleted", "Document", d._id, { filename: d.filename, sha256: d.sha256 });
    touchJob(req.auth!.companyId, req.params.jobId, "documents");
    res.status(204).end();
  }),
);
