import type { MeasurementProvider } from "./types";
import { mockProvider } from "./mockProvider";

const providers: Record<string, MeasurementProvider> = { mock: mockProvider };

export function getProvider(name: string): MeasurementProvider {
  const p = providers[name];
  if (!p) throw new Error(`Unknown measurement provider: ${name}`);
  return p;
}
