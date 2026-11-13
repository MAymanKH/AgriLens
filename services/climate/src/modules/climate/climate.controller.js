import { Router } from "express";
import { climateService } from "./climate.service.js";
import { successRes } from "../../utils/success.res.js";

const router = Router();

export const routes = {
  base: "/internal/climate",
  getClimate: "/",
};

export const createClimateController = (service = climateService) => async (req, res) => {
  const data = await service.getClimate(req.query.region_id);
  return successRes({ res, data, raw: true });
};

router.get(routes.getClimate, createClimateController());

export default router;
