import type { Unit } from "./types";

export interface PriceEntry {
  description: string;
  category: string;
  unit: Unit;
  unitPriceCents: number;
  taxable: boolean;
}

/** Illustrative installed prices. Replace with a company or regional price list (Step 5 follow-up). */
export const DEFAULT_PRICES: Record<string, PriceEntry> = {
  tear_off: { description: "Remove existing shingles, laminated", category: "Tear-off", unit: "SQ", unitPriceCents: 6000, taxable: false },
  underlayment: { description: "Synthetic underlayment", category: "Underlayment", unit: "SQ", unitPriceCents: 3000, taxable: true },
  shingles: { description: "Architectural shingles, installed", category: "Roofing", unit: "SQ", unitPriceCents: 33000, taxable: true },
  starter: { description: "Starter strip, eaves and rakes", category: "Roofing", unit: "LF", unitPriceCents: 250, taxable: true },
  ridge_cap: { description: "Ridge and hip cap shingles", category: "Roofing", unit: "LF", unitPriceCents: 500, taxable: true },
  drip_edge: { description: "Drip edge, aluminum", category: "Metal", unit: "LF", unitPriceCents: 325, taxable: true },
  valley_metal: { description: "Valley metal", category: "Metal", unit: "LF", unitPriceCents: 900, taxable: true },
  pipe_jacks: { description: "Pipe jack flashing", category: "Flashing", unit: "EA", unitPriceCents: 9500, taxable: true },
  steep: { description: "Additional charge, steep roof (7/12 and up)", category: "Labor", unit: "SQ", unitPriceCents: 4500, taxable: false },
  haul_off: { description: "Debris haul-off and dumpster", category: "General", unit: "EA", unitPriceCents: 45000, taxable: false },
};
