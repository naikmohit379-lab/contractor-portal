import type { RequestHandler } from "express";

/** Strips Mongo operator keys ($where, $ne, dotted paths) from user input to block NoSQL injection. */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".")) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

export const sanitize: RequestHandler = (req, _res, next) => {
  req.body = clean(req.body);
  req.query = clean(req.query) as typeof req.query;
  next();
};
