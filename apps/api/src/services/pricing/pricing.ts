import { DEFAULT_PRICES, type PriceEntry } from "@roofdesk/estimate-engine";
import type { PriceListDTO } from "@roofdesk/shared";
import { PriceList } from "../../models/PriceList";
import { Company } from "../../models/Company";

const defaultItems = () => Object.entries(DEFAULT_PRICES).map(([key, p]) => ({ key, ...p }));

/** The company's active price list. The first time anyone asks, it is created from the standard prices. */
export async function getActivePriceList(country: "IN" | "US" = "US") {
  const active = await PriceList.findOne({ active: true }).sort({ version: -1 });
  if (active) return { doc: active, isDefault: false };
  // Never seed the U.S. sample price catalog into an Indian company. It would
  // otherwise be displayed as INR even though the values are U.S. examples.
  const created = await PriceList.create({ version: 1, active: true, items: country === "IN" ? [] : defaultItems() });
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
export async function pricesForEstimates(country: "IN" | "US" = "US"): Promise<Record<string, PriceEntry>> {
  const { doc } = await getActivePriceList(country);
  // Keep the familiar scope template for India but blank out all rates. Contractors
  // must enter local prices before issuing an estimate; U.S. sample rates are never reused.
  const merged: Record<string, PriceEntry> = country === "IN"
    ? Object.fromEntries(Object.entries(DEFAULT_PRICES).map(([key, price]) => [key, { ...price, unitPriceCents: 0, taxable: false }]))
    : { ...DEFAULT_PRICES };
  for (const i of doc.items) {
    merged[i.key!] = { description: i.description!, category: i.category!, unit: i.unit as PriceEntry["unit"], unitPriceCents: i.unitPriceCents!, taxable: !!i.taxable };
  }
  return merged;
}
