export interface NormalizedReport {
  preliminary?: boolean;
  reviewStatus?: string;
  imageryDate?: Date;
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
  orderReport(input: { address: string; idempotencyKey: string; coordinates?: { lat: number; lng: number }; pitch?: number; building?: number }): Promise<{ providerOrderId: string; providerJobId?: string }>;
  fetchReport(providerOrderId: string, address: string, providerJobId?: string): Promise<NormalizedReport>;
}
