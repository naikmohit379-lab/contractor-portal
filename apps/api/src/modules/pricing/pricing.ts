import { DEFAULT_PRICES, type PriceEntry } from "@roofdesk/estimate-engine";
import type { PriceListDTO } from "@roofdesk/shared";
import { PriceList } from "../../models/PriceList";

const defaultItems = () => Object.entries(DEFAULT_PRICES).map(([key, p]) => ({ key, ...p }));

/** The company's active price list. The first time anyone asks, it is created from the standard prices. */
export async function getActivePriceList() {
  const active = await PriceList.findOne({ active: true }).sort({ version: -1 });
  if (active) return { doc: active, isDefault: false };
  const created = await PriceList.create({ version: 1, active: true, items: defaultItems() });
  return { doc: created, isDefault: true };
}

export const toPriceListDTO = (doc: any, isDefault: boolean): PriceListDTO => ({
  version: doc.version,
  isDefault,
  items: doc.items.map((i: any) => ({ key: i.key, description: i.description, category: i.category, unit: i.unit, unitPriceCents: i.unitPriceCents, taxable: i.taxable })),
  updatedAt: doc.updatedAt?.toISOString(),
});

/**
 * Prices the estimate template uses: the standard prices, overridden by the company's list.
 * Standard items missing from a company list fall back to the standard price, so generation never breaks.
 */
export async function pricesForEstimates(): Promise<Record<string, PriceEntry>> {
  const { doc } = await getActivePriceList();
  const merged: Record<string, PriceEntry> = { ...DEFAULT_PRICES };
  for (const i of doc.items) {
    merged[i.key!] = { description: i.description!, category: i.category!, unit: i.unit as PriceEntry["unit"], unitPriceCents: i.unitPriceCents!, taxable: !!i.taxable };
  }
  return merged;
}
