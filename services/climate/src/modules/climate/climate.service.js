import { getClimateData } from "../../DB/DB.connection.js";
import { errorRes } from "../../utils/error.handel.js";
import { validateClimateData } from "../../climate/validateClimateData.js";

const datasetIssue = (data) => {
  if (!data) return "The configured climate dataset is unavailable.";
  const { manifest, daily } = data;
  if (manifest.schema_version !== 1) return "The climate dataset uses an unsupported schema version.";
  if (manifest.kind !== "observed" || manifest.status !== "approved") {
    return "The selected climate dataset has not been approved for live use.";
  }
  if (!manifest.approval?.research_record || !manifest.approval?.technical_record) {
    return "The selected climate dataset is missing required approval records.";
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

export const createClimateService = ({
  repository = { getClimateData },
  getDatasetId = () => process.env.CLIMATE_DATASET_ID,
} = {}) => ({
  async getClimate(regionId) {
    if (typeof regionId !== "string" || !regionId.trim()) {
      errorRes({ code: "INVALID_INPUT", msg: "Provide a non-empty region_id query parameter.", statusCode: 400 });
    }
    const datasetId = getDatasetId();
    if (!datasetId) {
      errorRes({ code: "SERVICE_UNAVAILABLE", msg: "No climate dataset is configured.", statusCode: 503 });
    }

    let data;
    try {
      data = await repository.getClimateData(datasetId);
    } catch {
      errorRes({ code: "SERVICE_UNAVAILABLE", msg: "Climate storage is unavailable. Retry shortly.", statusCode: 503 });
    }
    if (!data) {
      errorRes({ code: "INSUFFICIENT_DATA", msg: "The configured climate dataset is unavailable.", statusCode: 422 });
    }
    if (data.manifest.region?.id !== regionId) {
      errorRes({ code: "UNKNOWN_REGION", msg: "This region is not supported.", statusCode: 404 });
    }
    const issue = datasetIssue(data);
    if (issue) errorRes({ code: "INSUFFICIENT_DATA", msg: issue, statusCode: 422 });
    return toClimateResponse(data);
  },

  async getHealth() {
    const datasetId = getDatasetId();
    if (!datasetId) {
      errorRes({ code: "SERVICE_UNAVAILABLE", msg: "No climate dataset is configured.", statusCode: 503 });
    }
    try {
      const data = await repository.getClimateData(datasetId);
      if (datasetIssue(data)) {
        errorRes({ code: "SERVICE_UNAVAILABLE", msg: "No selected climate dataset is ready to serve.", statusCode: 503 });
      }
    } catch (error) {
      if (error?.cause?.code === "SERVICE_UNAVAILABLE") throw error;
      errorRes({ code: "SERVICE_UNAVAILABLE", msg: "Climate storage is unavailable. Retry shortly.", statusCode: 503 });
    }
    return { status: "ok" };
  },
});

export const climateService = createClimateService();

