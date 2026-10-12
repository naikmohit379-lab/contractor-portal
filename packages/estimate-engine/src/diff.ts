import { lineTotalCents } from "./totals";
import type { LineItem } from "./types";

export interface VersionDiff {
  added: LineItem[];
  removed: LineItem[];
  changed: { key: string; description: string; from: LineItem; to: LineItem; deltaCents: number }[];
  deltaSubtotalCents: number;
}

/** Compares two estimate versions line by line (matched on `key`) for supplements and carrier comparisons. */
export function diffVersions(from: LineItem[], to: LineItem[]): VersionDiff {
  const a = new Map(from.map((i) => [i.key, i]));
  const b = new Map(to.map((i) => [i.key, i]));

  const added = to.filter((i) => !a.has(i.key));
  const removed = from.filter((i) => !b.has(i.key));
  const changed: VersionDiff["changed"] = [];

  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev) continue;
    if (prev.quantity !== next.quantity || prev.unitPriceCents !== next.unitPriceCents || prev.description !== next.description) {
      changed.push({ key, description: next.description, from: prev, to: next, deltaCents: lineTotalCents(next) - lineTotalCents(prev) });
    }
  }

  const sum = (items: LineItem[]) => items.reduce((n, i) => n + lineTotalCents(i), 0);
  return { added, removed, changed, deltaSubtotalCents: sum(to) - sum(from) };
}
