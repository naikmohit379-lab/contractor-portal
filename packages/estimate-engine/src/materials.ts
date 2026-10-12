import type { LineItem, Unit } from "./types";

export interface MaterialLine {
  key: string;
  description: string;
  unit: Unit;
  quantity: number;
}

/** How many ordering packages cover one estimate unit. Labor-only lines (tear-off, haul-off, steep) are not materials. */
const RULES: Record<string, { description: string; unit: Unit; perPackage?: number; perSquare?: number }> = {
  shingles: { description: "Architectural shingles (bundles)", unit: "BDL", perSquare: 3 },
  underlayment: { description: "Synthetic underlayment (10-square rolls)", unit: "ROLL", perPackage: 10 },
  ridge_cap: { description: "Ridge cap shingles (bundles, about 33 LF each)", unit: "BDL", perPackage: 33 },
  starter: { description: "Starter strip (bundles, about 120 LF each)", unit: "BDL", perPackage: 120 },
  drip_edge: { description: "Drip edge (10 ft pieces)", unit: "PC", perPackage: 10 },
  valley_metal: { description: "Valley metal (10 ft pieces)", unit: "PC", perPackage: 10 },
  pipe_jacks: { description: "Pipe jack flashings", unit: "EA", perPackage: 1 },
};

/** Converts estimate quantities (squares, linear feet) into whole packages a supplier sells. */
export function buildMaterialList(items: LineItem[]): MaterialLine[] {
  const out: MaterialLine[] = [];
  for (const i of items) {
    const r = RULES[i.key];
    if (!r || i.quantity <= 0) continue;
    const quantity = r.perSquare ? Math.ceil(i.quantity * r.perSquare) : Math.ceil(i.quantity / (r.perPackage ?? 1));
    out.push({ key: i.key, description: r.description, unit: r.unit, quantity });
  }
  return out;
}

/** Material keys a supplier catalog can map to SKUs. */
export const MATERIAL_KEYS = Object.keys(RULES);
export const MATERIAL_LABELS: Record<string, string> = Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, r.description]));
