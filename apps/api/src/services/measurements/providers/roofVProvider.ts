import { env } from "../../../config/env";
import type { MeasurementProvider, NormalizedReport } from "./types";

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
  if (!env.ROOFV_ENABLED || !env.ROOFV_API_KEY) {
    throw new Error("RoofV is not enabled. Configure ROOFV_ENABLED and ROOFV_API_KEY on the API server.");
  }
  const response = await fetch(`${env.ROOFV_API_BASE.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.ROOFV_API_KEY}`,
      Accept: "application/json",
      "User-Agent": "RoofDesk/1.0",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `RoofV returned HTTP ${response.status}`;
    throw new Error(String(message).slice(0, 300));
  }
  return payload;
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
    imageryDate: imageryDate ? new Date(imageryDate) : new Date(),
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
  async fetchReport(providerOrderId, _address, providerJobId) {
    const path = providerJobId
      ? `/jobs/${encodeURIComponent(providerJobId)}/measurements`
      : `/measurements/${encodeURIComponent(providerOrderId)}`;
    return normalize(await roofVRequest(path));
  },
};
