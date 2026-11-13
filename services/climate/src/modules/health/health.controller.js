import { Router } from "express";
import { climateService } from "../climate/climate.service.js";
import { successRes } from "../../utils/success.res.js";

const router = Router();

export const routes = {
  base: "/health",
  getHealth: "/",
};

export const createHealthController = (service = climateService) => async (_req, res) => {
  const data = await service.getHealth();
  return successRes({ res, data, raw: true });
};

router.get(routes.getHealth, createHealthController());

export default router;
