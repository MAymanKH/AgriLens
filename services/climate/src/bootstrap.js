import cors from "cors";
import express from "express";
import climateRouter, { routes as climateRoutes } from "./modules/climate/climate.controller.js";
import healthRouter, { routes as healthRoutes } from "./modules/health/health.controller.js";
import { closeDatabase } from "./DB/DB.connection.js";
import { errorHandler } from "./utils/error.handel.js";

const bootstrap = async () => {
  if ((process.env.DATA_MODE || "live") !== "live") {
    throw new Error("Climate live service only supports DATA_MODE=live; use `python3 tools/dev.py fixtures climate` for fixtures.");
  }

  const app = express();
  const port = Number(process.env.PORT || process.env.CLIMATE_PORT || 8001);
  const host = process.env.HOST || "127.0.0.1";

  app.use(express.json());
  app.use(cors({ origin: "*" }));
  app.use(climateRoutes.base, climateRouter);
  app.use(healthRoutes.base, healthRouter);
  app.use(errorHandler);

  const server = app.listen(port, host, () => {
    console.log(`Climate service listening at http://${host}:${port}`);
  });

  const shutdown = () => server.close(async () => closeDatabase());
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
};

export default bootstrap;
