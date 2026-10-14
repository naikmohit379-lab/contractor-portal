import { UNITS, type UnitCode } from "./units";

export interface PriceItem {
  key: string;
  description: string;
  category: string;
  unit: UnitCode;
  unitPriceCents: number;
  taxable: boolean;
}

export const slugifyKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

const HEADER_ALIASES: Record<string, string> = {
  key: "key", id: "key", code: "key",
  description: "description", item: "description", name: "description",
  category: "category", group: "category",
  unit: "unit", uom: "unit",
  unit_price: "price", "unit price": "price", price: "price", "unit price (usd)": "price", cost: "price",
  taxable: "taxable", tax: "taxable",
};

/** "$1,234.50" or "1234.5" to integer cents. Returns null if it is not a non-negative amount. */
export function dollarsToCentsStrict(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export interface PriceCsvResult {
  items: PriceItem[];
  errors: { row: number; message: string }[];
}

/**
 * Turns parsed CSV rows into price list items, checking every row and reporting problems by row number.
 * Columns can be in any order; required: description, unit and a price. Key is made from the description if missing.
 */
export function priceListFromCsv(rows: string[][]): PriceCsvResult {
  const errors: PriceCsvResult["errors"] = [];
  if (rows.length === 0) return { items: [], errors: [{ row: 1, message: "The file is empty" }] };

  const header = rows[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  for (const need of ["description", "unit", "price"]) {
    if (!header.includes(need)) errors.push({ row: 1, message: `Missing a "${need === "price" ? "unit price" : need}" column` });
  }
  if (errors.length) return { items: [], errors };

  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();
  const items: PriceItem[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((r, idx) => {
    const row = idx + 2;
    const description = col(r, "description");
    const unit = col(r, "unit").toUpperCase();
    const price = dollarsToCentsStrict(col(r, "price"));
    const key = header.includes("key") && col(r, "key") ? slugifyKey(col(r, "key")) : slugifyKey(description);
    const taxRaw = header.includes("taxable") ? col(r, "taxable").toLowerCase() : "yes";

    const problems: string[] = [];
    if (description.length < 2) problems.push("description is too short");
    if (!(UNITS as readonly string[]).includes(unit)) problems.push(`unit "${col(r, "unit")}" is not one of ${UNITS.join(", ")}`);
    if (price === null) problems.push(`unit price "${col(r, "price")}" is not a dollar amount`);
    if (!key) problems.push("could not make an id from the description");
    if (key && seen.has(key)) problems.push(`"${key}" appears more than once`);
    if (taxRaw && !["yes", "no", "true", "false", "y", "n", "1", "0"].includes(taxRaw)) problems.push(`taxable "${taxRaw}" should be yes or no`);

    if (problems.length) return void errors.push({ row, message: problems.join("; ") });
    seen.add(key);
    items.push({
      key,
      description,
      category: col(r, "category") || "General",
      unit: unit as UnitCode,
      unitPriceCents: price!,
      taxable: ["yes", "true", "y", "1", ""].includes(taxRaw),
    });
  });

  if (items.length === 0 && errors.length === 0) errors.push({ row: 2, message: "No price rows found" });
  return { items, errors };
}
