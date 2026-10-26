export interface NormalizedReport {
  imageryDate: Date;
  facets: { id: string; areaSqFt: number; pitch: string }[];
  linear: { ridge: number; hip: number; valley: number; eave: number; rake: number };
  totals: { areaSqFt: number; squares: number; wastePct: number };
}

/**
 * Every aerial measurement vendor (EagleView, Hover, ...) is wrapped in this interface,
 * so the rest of the app never depends on one vendor's payload.
 */
export interface MeasurementProvider {
  readonly name: string;
  orderReport(input: { address: string; idempotencyKey: string }): Promise<{ providerOrderId: string }>;
  fetchReport(providerOrderId: string, address: string): Promise<NormalizedReport>;
}
