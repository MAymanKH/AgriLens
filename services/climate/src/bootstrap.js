import cors from "cors";
import express from "express";
import { closeDatabase, getClimateData } from "./DB/DB.connection.js";
import { validateClimateData } from "./climate/validateClimateData.js";

const statusByCode = {
  INVALID_INPUT: 400,
  UNKNOWN_REGION: 404,
  UNSUPPORTED_SCENARIO: 422,
  INSUFFICIENT_DATA: 422,
  SERVICE_UNAVAILABLE: 503,
};

const errorResponse = (res, code, message) => res.status(statusByCode[code] || 500).json({
  error: { code, message },
});

const toClimateResponse = ({ manifest, daily }) => ({
  region_id: manifest.region.id,
  coordinates: manifest.region.coordinates,
  period: manifest.period,
  units: { tmax: manifest.units.tmax, rain: manifest.units.rain },
  daily: daily.map((record) => ({
    date: record.date,
    tmax_c: record.tmax_c ?? null,
    rain_mm: record.rain_mm ?? null,
  })),
  scenarios: {
    hottest_year: {
      year: manifest.scenarios?.hottest_year?.year ?? null,
      rule: manifest.scenarios?.hottest_year?.rule ?? "Unavailable",
    },
    driest_year: {
      year: manifest.scenarios?.driest_year?.year ?? null,
      rule: manifest.scenarios?.driest_year?.rule ?? "Unavailable",
    },
  },
  provenance: {
    source_url: manifest.provenance.source_url,
    retrieved_at: manifest.provenance.retrieved_at instanceof Date
      ? manifest.provenance.retrieved_at.toISOString()
      : manifest.provenance.retrieved_at,
    missing_days: manifest.provenance.missing_days,
    spatial_resolution: manifest.provenance.spatial_resolution,
    time_standard: manifest.provenance.time_standard,
  },
});

const datasetIssue = (data, mode) => {
  if (!data) return "The configured climate dataset is unavailable.";
  const { manifest, daily } = data;
  if (manifest.schema_version !== 1) return "The climate dataset uses an unsupported schema version.";
  if (manifest.kind !== "observed" || manifest.status !== (mode === "unreviewed" ? "sealed" : "approved")) {
    return "The selected climate dataset is unavailable in this data mode.";
  }
  if (mode === "unreviewed" ? manifest.approval !== null : (!manifest.approval?.research_record || !manifest.approval?.technical_record)) {
    return "The selected climate dataset approval metadata does not match this data mode.";
  }
  const { lat, lon } = manifest.region?.coordinates || {};
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180 ||
      manifest.units?.tmax !== "C" || manifest.units?.rain !== "mm/day" ||
      typeof manifest.parameters?.tmax !== "string" || typeof manifest.parameters?.rain !== "string" ||
      !manifest.validation?.method_ref || !manifest.validation?.report_uri ||
      !manifest.period || !manifest.provenance?.source_url ||
      !manifest.provenance?.retrieved_at || manifest.provenance.missing_days == null ||
      !manifest.provenance.spatial_resolution || !manifest.provenance.time_standard) {
    return "The selected climate dataset is missing required provenance or validation metadata.";
  }
  const validation = validateClimateData({ manifest, daily });
  return validation.ok ? null : validation.issues[0];
};

export const createClimateHandlers = ({
  mode = "live",
  repository = { getClimateData },
  getDatasetId = () => process.env.CLIMATE_DATASET_ID,
} = {}) => {
  const health = async (_req, res) => {
    try {
      const datasetId = getDatasetId();
      if (!datasetId) {
        return errorResponse(res, "SERVICE_UNAVAILABLE", "No climate dataset is configured.");
      }
      const data = await repository.getClimateData(datasetId);
      const issue = datasetIssue(data, mode);
      if (issue) return errorResponse(res, "SERVICE_UNAVAILABLE", "No selected climate dataset is ready to serve.");
      return res.status(200).json({ status: "ok" });
    } catch {
      return errorResponse(res, "SERVICE_UNAVAILABLE", "Climate storage is unavailable. Retry shortly.");
    }
  };

  const climate = async (req, res) => {
    const regionId = req.query.region_id;
    if (typeof regionId !== "string" || !regionId.trim()) {
      return errorResponse(res, "INVALID_INPUT", "Provide a non-empty region_id query parameter.");
    }
    const datasetId = getDatasetId();
    if (!datasetId) {
      return errorResponse(res, "SERVICE_UNAVAILABLE", "No climate dataset is configured.");
    }

    try {
      const data = await repository.getClimateData(datasetId);
      if (!data) {
        return errorResponse(res, "INSUFFICIENT_DATA", "The configured climate dataset is unavailable.");
      }

      const { manifest } = data;
      if (manifest.region?.id !== regionId) {
        return errorResponse(res, "UNKNOWN_REGION", "This region is not supported.");
      }
      const issue = datasetIssue(data, mode);
      if (issue) return errorResponse(res, "INSUFFICIENT_DATA", issue);

      return res.status(200).json(toClimateResponse(data));
    } catch {
      return errorResponse(res, "SERVICE_UNAVAILABLE", "Climate storage is unavailable. Retry shortly.");
    }
  };

  return { health, climate };
};

export const createApp = (options = {}) => {
  const mode = options.mode || "live";
  if (!["live", "unreviewed"].includes(mode)) throw new Error("Invalid climate data mode.");
  const app = express();
  const handlers = createClimateHandlers(options);
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-AgriLens-Data-Mode", mode);
    next();
  });
  app.use(cors());
  app.use(express.json());
  app.get("/health", handlers.health);
  app.get("/internal/climate", handlers.climate);

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.parse.failed") {
      return errorResponse(res, "INVALID_INPUT", "Request body must contain valid JSON.");
    }
    return errorResponse(res, "SERVICE_UNAVAILABLE", "The climate service could not complete the request.");
  });

  return app;
};

export const bootstrap = async () => {
  const mode = process.env.DATA_MODE || "live";
  if (!["live", "unreviewed"].includes(mode)) {
    throw new Error("Climate service supports DATA_MODE=live or unreviewed; use `python3 tools/dev.py fixtures climate` for fixtures.");
  }
  const app = createApp({ mode });
  const port = Number(process.env.PORT || process.env.CLIMATE_PORT || 8001);
  const host = process.env.HOST || "127.0.0.1";
  const server = app.listen(port, host, () => {
    console.log(`Climate service listening at http://${host}:${port}`);
  });

  const shutdown = () => server.close(async () => closeDatabase());
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
};

export default bootstrap;
