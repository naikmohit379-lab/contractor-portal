export const UNITS = ["SQ", "LF", "EA", "SF", "BDL", "ROLL", "PC"] as const;
export type UnitCode = (typeof UNITS)[number];
