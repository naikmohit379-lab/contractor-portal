import { Router } from "express";
import { requireAuth } from "../../core/auth";
import { AppError } from "../../core/errors";
import { asyncHandler, requirePermission } from "../../core/http";
import { getRoofVQuota } from "./providers/roofVProvider";

export const measurementProvidersRouter = Router();
measurementProvidersRouter.use(requireAuth);

measurementProvidersRouter.get(
  "/roofv/quota",
  requirePermission("measurement:order"),
  asyncHandler(async (_req, res) => {
    try {
      // Return only quota fields. RoofV's /me also includes account identity and key abilities.
      res.json({ quota: await getRoofVQuota() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "RoofV account check failed.";
      throw new AppError(502, "roofv_quota_check_failed", message);
    }
  }),
);
