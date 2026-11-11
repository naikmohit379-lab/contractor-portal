import type { MeasurementProvider, NormalizedReport } from "./types";
import { MAX_UPLOAD_BYTES } from "@roofdesk/shared";

type JsonRecord = Record<string, any>;

export class RoofVPendingError extends Error {
  constructor() {
    super("RoofV has accepted the measurement and is still preparing or reviewing it.");
    this.name = "RoofVPendingError";
  }
}

function dataOf(payload: JsonRecord): JsonRecord {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

async function roofVRequest(path: string, body?: JsonRecord): Promise<JsonRecord> {
  const { env } = await import("../../../config/env");
  if (!env.ROOFV_ENABLED || !env.ROOFV_API_KEY) {
    throw new Error("RoofV is not enabled. Configure ROOFV_ENABLED and ROOFV_API_KEY on the API server.");
  }
  let response: Response;
  try {
    response = await fetch(`${env.ROOFV_API_BASE.replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${env.ROOFV_API_KEY}`,
        Accept: "application/json",
        "User-Agent": "Roofora/1.0",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // RoofV reads are free; a timed-out read must remain recoverable and must never
    // encourage the user to place another measurement order.
    if (!body && error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new RoofVPendingError();
    }
    throw error;
  }
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    if (!body && [429, 503].includes(response.status)) throw new RoofVPendingError();
    const message = payload?.error?.message ?? payload?.message ?? `RoofV returned HTTP ${response.status}`;
    throw new Error(String(message).slice(0, 300));
  }
  return payload;
}

export interface RoofVQuota {
  period?: string;
  included: number;
  includedUsed: number;
  includedRemaining: number;
  creditsBalance: number;
  creditsPerMeasurement: number;
  measurementsAvailable: number;
  resetsAt?: string;
}

/** Free account check used before a measurement so users can avoid unexpected credit use. */
export async function getRoofVQuota(apiKey?: string, apiBase?: string): Promise<RoofVQuota> {
  // Keep the pure, explicitly configured quota path usable in unit tests and local tooling
  // without eagerly parsing unrelated application secrets. Production routes call this with
  // no arguments and use the validated API server configuration.
  if (arguments.length === 0) {
    const { env } = await import("../../../config/env");
    apiKey = env.ROOFV_API_KEY;
    apiBase = env.ROOFV_API_BASE;
  }
  apiBase ??= "https://roofv.ai/api/public/v1";
  if (!apiKey) throw new Error("RoofV API key is not configured on this server.");
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/me`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": "Roofora/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new Error(`RoofV account check failed with HTTP ${response.status}. Check the Preview API key and its expiry.`);

  const quota = payload?.data?.measurement_quota;
  const numericFields = ["included", "included_used", "included_remaining", "credits_balance", "credits_per_measurement", "measurements_available"];
  if (!quota || numericFields.some((key) => !Number.isFinite(Number(quota[key])))) {
    throw new Error("RoofV account check returned no readable quota. Check the account response before ordering.");
  }

  return {
    period: typeof quota.period === "string" ? quota.period : undefined,
    included: Number(quota.included),
    includedUsed: Number(quota.included_used),
    includedRemaining: Number(quota.included_remaining),
    creditsBalance: Number(quota.credits_balance),
    creditsPerMeasurement: Number(quota.credits_per_measurement),
    measurementsAvailable: Number(quota.measurements_available),
    resetsAt: typeof quota.resets_at === "string" ? quota.resets_at : undefined,
  };
}

/** Download the provider's original report for a RoofV job without exposing the API key or URL to the browser. */
export async function fetchRoofVReportPdf(jobId: string, apiKey?: string, apiBase?: string): Promise<{ bytes: Buffer; filename: string } | undefined> {
  if (arguments.length === 1) {
    const { env } = await import("../../../config/env");
    if (!env.ROOFV_ENABLED || !env.ROOFV_API_KEY) throw new Error("RoofV is not enabled.");
    apiKey = env.ROOFV_API_KEY;
    apiBase = env.ROOFV_API_BASE;
  }
  if (!apiKey) throw new Error("RoofV is not enabled.");
  apiBase ??= "https://roofv.ai/api/public/v1";
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/jobs/${encodeURIComponent(jobId)}/report.pdf`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/pdf", "User-Agent": "Roofora/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  // RoofV may publish the report after the measurement payload is available.
  if (response.status === 404 || response.status === 409 || response.status === 425) return undefined;
  if (!response.ok) throw new Error(`RoofV PDF endpoint returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) throw new Error("RoofV report PDF exceeds the 15 MB attachment limit");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("RoofV returned an empty PDF response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new Error("RoofV report PDF exceeds the 15 MB attachment limit");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("RoofV report response was not a valid PDF");
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(disposition)?.[1];
  let filename = encodedName ? decodeURIComponent(encodedName.replace(/"/g, "")) : `roofv-report-${jobId}.pdf`;
  filename = filename.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120) || `roofv-report-${jobId}.pdf`;
  if (!filename.toLowerCase().endsWith(".pdf")) filename += ".pdf";
  return { bytes, filename };
}

function normalize(payload: JsonRecord): NormalizedReport {
  const data = dataOf(payload);
  const reviewStatus = String(data.review?.status ?? "unknown");
  if (["pending", "processing", "in_progress"].includes(reviewStatus) || data.status === "pending_review" || data.status === "measurement_in_progress") {
    throw new RoofVPendingError();
  }
  if (["rejected", "not_measurable"].includes(reviewStatus) || data.status === "not_measurable") throw new Error("RoofV could not measure this roof. Review its account response before ordering again.");

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const sourceFacets = sections.flatMap((section: JsonRecord) => Array.isArray(section.facets) ? section.facets : [section]);
  const facets = sourceFacets.map((facet: JsonRecord, index: number) => ({
    id: String(facet.id ?? facet.name ?? String.fromCharCode(65 + index)),
    areaSqFt: Number(facet.area_sqft ?? facet.areaSqFt ?? facet.roof_area_sqft ?? facet.area),
    pitch: String(facet.pitch ?? data.predominant_pitch ?? data.pitch ?? "Unknown"),
  })).filter((facet: { areaSqFt: number }) => Number.isFinite(facet.areaSqFt) && facet.areaSqFt > 0);

  const totals = data.totals ?? {};
  const areaSqFt = Number(data.roof_area_sqft ?? totals.roof_area_sqft ?? totals.roofAreaSqFt ?? data.area_sqft);
  if (!facets.length && Number.isFinite(areaSqFt) && areaSqFt > 0) {
    facets.push({ id: "Roof", areaSqFt, pitch: String(data.predominant_pitch ?? data.pitch ?? "Unknown") });
  }
  const total = facets.reduce((sum, facet) => sum + facet.areaSqFt, 0);
  if (!Number.isFinite(total) || total <= 0) throw new RoofVPendingError();

  const edges = data.edges?.lengths_ft ?? data.linear ?? {};
  const length = (...keys: string[]) => {
    for (const key of keys) {
      const value = Number(edges[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return 0;
  };
  const wastePct = Number(totals.waste_pct ?? data.waste_pct ?? data.recommended_waste ?? 0);
  const imageryDate = data.imagery_date ?? data.imageryDate;
  return {
    preliminary: Boolean(data.preliminary) || reviewStatus === "not_reviewed",
    reviewStatus,
    imageryDate: imageryDate ? new Date(imageryDate) : undefined,
    facets,
    linear: {
      ridge: length("ridge"), hip: length("hip"), valley: length("valley"),
      eave: length("eave"), rake: length("rake"),
    },
    totals: { areaSqFt: total, squares: Math.round((total / 100) * 100) / 100, wastePct: Number.isFinite(wastePct) ? wastePct : 0 },
  };
}

export const roofVProvider: MeasurementProvider = {
  name: "roofv",
  async orderReport({ address, coordinates, pitch, building, idempotencyKey }) {
    if (!coordinates) throw new Error("Add verified property latitude and longitude before ordering a RoofV measurement.");
    const payload = await roofVRequest("/measurements", {
      lat: coordinates.lat,
      lng: coordinates.lng,
      address,
      ...(pitch !== undefined ? { pitch } : {}),
      ...(building ? { building } : {}),
      save_as_job: true,
      job: { external_id: `roofdesk-${idempotencyKey}` },
    });
    const data = dataOf(payload);
    if (data.status === "ambiguous_building") {
      const choices = Array.isArray(data.candidates) ? ` RoofV found ${data.candidates.length} nearby options; choose the correct building.` : " Choose the correct nearby building.";
      throw new Error(`RoofV could not identify one building.${choices}`);
    }
    const roofId = data.roof_id ?? data.id;
    if (!roofId) throw new Error("RoofV accepted no measurement ID. Check the RoofV response and do not retry blindly.");
    return { providerOrderId: String(roofId), providerJobId: data.job?.id ? String(data.job.id) : undefined };
  },
  async fetchReport(providerOrderId) {
    // RoofV documents this free read as the canonical lookup for the roof_id
    // returned by POST /measurements. The saved-job endpoint reads a different object.
    return normalize(await roofVRequest(`/measurements/${encodeURIComponent(providerOrderId)}`));
  },
};
