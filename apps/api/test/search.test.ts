import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, createJob, registerCompany, startTestApp, type TestApp } from "./helpers";

describe("company search", () => {
  let app: TestApp;
  beforeAll(async () => { app = await startTestApp(); });
  afterAll(async () => { await app.close(); });

  it("requires authentication and validates the query length", async () => {
    expect((await app.call("GET", "/search?q=Roof")).status).toBe(401);
    const owner = await registerCompany(app);
    expect((await app.call("GET", "/search?q=x", { token: owner.token })).status).toBe(422);
  });

  it("searches jobs and documents within a company", async () => {
    const owner = await registerCompany(app, "Search Company");
    const jobId = await createJob(app, owner, "SearchPerson-Delta");
    const { requestContext } = await import("../src/core/context");
    const { Job } = await import("../src/models/Job");
    const { Document } = await import("../src/models/Document");

    await requestContext.run({ companyId: owner.companyId, userId: owner.userId, role: "owner" }, async () => {
      const job = await Job.findById(jobId);
      expect(job).toBeTruthy();
      await Document.create({
        jobId,
        kind: "document",
        filename: "roof-contract-searchdelta.pdf",
        contentType: "application/pdf",
        sizeBytes: 20,
        sha256: "a".repeat(64),
        storageKey: "search-test/roof-contract-searchdelta.pdf",
        tags: ["approved"],
        caption: "Searchable test document",
        uploadedBy: owner.userId,
      });
    });

    const jobResults = await app.call("GET", "/search?q=SearchPerson-Delta", { token: owner.token });
    expect(jobResults.status).toBe(200);
    expect(jobResults.body.jobs).toHaveLength(1);
    expect(jobResults.body.jobs[0].id).toBe(jobId);

    const docResults = await app.call("GET", "/search?q=searchdelta", { token: owner.token });
    expect(docResults.status).toBe(200);
    expect(docResults.body.documents).toHaveLength(1);
    expect(docResults.body.documents[0]).toMatchObject({ jobId, jobNumber: jobResults.body.jobs[0].jobNumber });
  });

  it("does not expose another company or unassigned jobs to an Operations user", async () => {
    const company = await registerCompany(app, "Tenant Search One");
    const otherCompany = await registerCompany(app, "Tenant Search Two");
    const ownJob = await createJob(app, company, "Needle-Company-Only");
    await createJob(app, otherCompany, "Needle-Company-Only");

    const operations = await addUser(app, company.companyId, "operations");
    const assignedJob = await createJob(app, company, "Needle-Assigned-Only");
    const { requestContext } = await import("../src/core/context");
    const { Job } = await import("../src/models/Job");
    await requestContext.run({ companyId: company.companyId, userId: company.userId, role: "owner" }, async () => {
      await Job.updateOne({ _id: assignedJob }, { $addToSet: { assigneeIds: operations.userId } });
    });

    const tenantResults = await app.call("GET", "/search?q=Needle-Company-Only", { token: company.token });
    expect(tenantResults.body.jobs).toHaveLength(1);
    expect(tenantResults.body.jobs[0].id).toBe(ownJob);

    const operationsResults = await app.call("GET", "/search?q=Needle-Assigned-Only", { token: operations.token });
    expect(operationsResults.body.jobs).toHaveLength(1);
    expect(operationsResults.body.jobs[0].id).toBe(assignedJob);
  });
});
