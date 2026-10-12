import { Schema, Types } from "mongoose";
import { getContext } from "./context";

const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "countDocuments",
] as const;

/**
 * Adds companyId to a schema and forces every read/write to be scoped to the current tenant.
 * - Inside an authenticated request: companyId is injected automatically.
 * - Outside a request (login, workers): the query MUST opt out with .setOptions({ skipTenant: true }),
 *   otherwise an error is thrown, so a missing scope fails loudly instead of leaking data.
 */
export function tenancyPlugin(schema: Schema) {
  schema.add({ companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true } });

  for (const op of QUERY_OPS) {
    schema.pre(op, function (this: any) {
      if (this.getOptions?.().skipTenant) return;
      const ctx = getContext();
      if (!ctx) throw new Error(`Tenant context missing for ${op} on ${this.model?.modelName}`);
      this.where({ companyId: ctx.companyId });
    });
  }

  schema.pre("aggregate", function (this: any) {
    const ctx = getContext();
    if (!ctx) throw new Error("Tenant context missing for aggregate");
    this.pipeline().unshift({ $match: { companyId: new Types.ObjectId(ctx.companyId) } });
  });

  schema.pre("validate", function (this: any) {
    const ctx = getContext();
    if (!this.companyId && ctx) this.companyId = ctx.companyId;
  });
}
