import { createHash } from "node:crypto";
import type { MeasurementProvider, NormalizedReport } from "./types";

const seed = (s: string) => parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic fake provider for local development and tests: same address, same roof. */
export const mockProvider: MeasurementProvider = {
  name: "mock",
  async orderReport({ idempotencyKey }) {
    return { providerOrderId: `mock_${createHash("sha1").update(idempotencyKey).digest("hex").slice(0, 10)}` };
  },
  async fetchReport(_orderId, address): Promise<NormalizedReport> {
    await sleep(2500); // simulate provider turnaround
    const n = seed(address);
    const pitch = `${4 + (n % 6)}/12`;
    const facets = ["A", "B", "C", "D"].map((id, i) => ({ id, areaSqFt: 380 + ((n >> (i * 3)) % 420), pitch }));
    const areaSqFt = facets.reduce((sum, f) => sum + f.areaSqFt, 0);
    return {
      imageryDate: new Date(Date.now() - (20 + (n % 90)) * 24 * 60 * 60 * 1000),
      facets,
      linear: { ridge: 38 + (n % 20), hip: 52 + (n % 30), valley: 14 + (n % 18), eave: 118 + (n % 40), rake: 36 + (n % 24) },
      totals: { areaSqFt, squares: Math.round((areaSqFt / 100) * 10) / 10, wastePct: 12 },
    };
  },
};
