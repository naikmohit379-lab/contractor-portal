import { Router } from "express";
import { DEFAULT_PRICES } from "@roofdesk/estimate-engine";
import { priceListSchema } from "@roofdesk/shared";
import { audit } from "../../core/audit";
import { requireAuth } from "../../core/auth";
import { invalidate } from "../../core/notify";
import { asyncHandler, requirePermission, validate } from "../../core/http";
import { PriceList } from "../../models/PriceList";
import { Company } from "../../models/Company";
import { getActivePriceList, toPriceListDTO } from "./pricing";

export const pricingRouter = Router();
pricingRouter.use(requireAuth);

pricingRouter.get(
  "/active",
  requirePermission("job:read"),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country");
    const { doc, isDefault } = await getActivePriceList(company?.settings?.country ?? "US");
    res.json(toPriceListDTO(doc, isDefault));
  }),
);

async function saveVersion(req: any, items: any[]) {
  const company = await Company.findById(req.auth!.companyId).select("settings.country");
  const country = company?.settings?.country ?? "US";
  const { doc: current } = await getActivePriceList(country);
  current.active = false;
  await current.save();
  const next = await PriceList.create({ version: current.version + 1, active: true, items, createdBy: req.auth.userId });
  await audit(req, "price_list.saved", "PriceList", next._id, { version: next.version, items: items.length });
  invalidate(req.auth.companyId, ["price-list"]);
  return next;
}

/** Saving never edits the old list: it creates a new version, so estimates already made keep the prices they used. */
pricingRouter.put(
  "/active",
  requirePermission("estimate:write"),
  validate({ body: priceListSchema }),
  asyncHandler(async (req, res) => {
    const seen = new Set<string>();
    for (const i of req.body.items) {
      if (seen.has(i.key)) return void res.status(422).json({ error: { code: "duplicate_item", message: `"${i.key}" appears twice. Each item needs a unique id.` } });
      seen.add(i.key);
    }
    res.json(toPriceListDTO(await saveVersion(req, req.body.items), false));
  }),
);

pricingRouter.post(
  "/reset",
  requirePermission("estimate:write"),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.auth!.companyId).select("settings.country");
    const items = company?.settings?.country === "IN" ? [] : Object.entries(DEFAULT_PRICES).map(([key, p]) => ({ key, ...p }));
    res.json(toPriceListDTO(await saveVersion(req, items), false));
  }),
);
