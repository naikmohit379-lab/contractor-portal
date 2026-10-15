import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJob, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let owner: Session;
let jobId: string;
let orderId: string;
let supplierId: string;
const invoicePdf = Buffer.from("%PDF-1.7\nSupplier invoice test bytes\n%%EOF");

beforeAll(async () => {
  app = await startTestApp();
  owner = await registerCompany(app, "Invoice Co");
  jobId = await createJob(app, owner);
});
afterAll(async () => { await app?.close(); });

describe("supplier invoices", () => {
  it("uploads a verified PDF, stores its price comparison, and reports the variance", async () => {
    const supplier = await app.call("POST", "/suppliers", { token: owner.token, body: { name: "Test Supply" } });
    expect(supplier.status).toBe(201);
    supplierId = supplier.body.id;
    const order = await app.call("POST", `/jobs/${jobId}/orders`, {
      token: owner.token,
      body: {
        supplierId,
        lines: [{ key: "shingles", description: "Architectural shingles", unit: "BDL", quantity: 2, unitPriceCents: 2500 }],
      },
    });
    expect(order.status).toBe(201);
    orderId = order.body.id;

    const uploaded = await app.call("POST", `/jobs/${jobId}/orders/${orderId}/invoice`, {
      token: owner.token,
      raw: invoicePdf,
      headers: {
        "Content-Type": "application/pdf",
        "X-File-Name": "supplier-invoice.pdf",
        "X-Invoice-Number": "INV-1001",
        "X-Invoice-Total-Cents": "6100",
      },
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.supplierInvoice).toMatchObject({
      invoiceNumber: "INV-1001",
      totalCents: 6100,
      expectedTotalCents: 5000,
      varianceCents: 1100,
      variancePct: 22,
    });

    const report = await app.call("GET", "/reports/price-variance", { token: owner.token });
    expect(report.status).toBe(200);
    expect(report.body.items).toHaveLength(1);
    expect(report.body.totals).toMatchObject({ expectedCents: 5000, invoiceCents: 6100, varianceCents: 1100 });

    const file = await fetch(`${app.base}/jobs/${jobId}/documents/${uploaded.body.supplierInvoice.documentId}/file`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await file.arrayBuffer()).equals(invoicePdf)).toBe(true);
  });

  it("rejects non-PDF bytes and refuses a second invoice for the same order", async () => {
    const blankOrder = await app.call("POST", `/jobs/${jobId}/orders`, {
      token: owner.token,
      body: { supplierId, lines: [{ key: "shingles", description: "Architectural shingles", unit: "BDL", quantity: 2, unitPriceCents: 2500 }] },
    });
    const invalid = await app.call("POST", `/jobs/${jobId}/orders/${blankOrder.body.id}/invoice`, {
      token: owner.token,
      raw: Buffer.from("This is not a PDF file"),
      headers: { "Content-Type": "application/pdf", "X-Invoice-Number": "INV-1002", "X-Invoice-Total-Cents": "5000" },
    });
    expect(invalid.status).toBe(415);

    const duplicate = await app.call("POST", `/jobs/${jobId}/orders/${orderId}/invoice`, {
      token: owner.token,
      raw: invoicePdf,
      headers: { "Content-Type": "application/pdf", "X-Invoice-Number": "INV-1002", "X-Invoice-Total-Cents": "5000" },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("invoice_exists");
  });
});
