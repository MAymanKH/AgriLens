import assert from "node:assert/strict";
import { test } from "node:test";
import { createClimateHandlers } from "../src/bootstrap.js";
import { validateClimateData } from "../src/climate/validateClimateData.js";

const makeDataset = () => {
  const daily = [];
  for (let day = 0; day < 366; day += 1) {
    daily.push({
      date: new Date(Date.UTC(2020, 0, 1 + day)).toISOString().slice(0, 10),
      tmax_c: 24.5,
      rain_mm: 0,
    });
  }
  const manifest = {
    schema_version: 1,
    kind: "observed",
    status: "approved",
    approval: { research_record: "research-signoff-1", technical_record: "validation-report-1" },
    region: { id: "test_region", coordinates: { lat: 30, lon: 31 } },
    period: { first_year: 2020, last_year: 2020 },
    units: { tmax: "C", rain: "mm/day" },
    parameters: { tmax: "T2M_MAX", rain: "PRECTOTCORR" },
    validation: {
      method_ref: "method-v1",
      report_uri: "validation-report-1",
      expected_days: 366,
      record_count: 366,
      complete_years: [2020],
    },
    scenarios: {
      hottest_year: { year: 2020, rule: "test hottest rule" },
      driest_year: { year: 2020, rule: "test driest rule" },
    },
    provenance: {
      source_url: "https://example.invalid/nasa-power",
      retrieved_at: "2026-11-13T00:00:00.000Z",
      missing_days: 0,
      spatial_resolution: "test grid",
      time_standard: "LST",
    },
  };
  return { manifest, daily };
};

const makeHandlers = (dataset, repositoryOverride, datasetId = "test-dataset") => {
  const repository = repositoryOverride || { getClimateData: async () => dataset };
  return createClimateHandlers({ repository, getDatasetId: () => datasetId });
};

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("health is ready only when the selected approved dataset passes validation", async () => {
  const dataset = makeDataset();
  assert.equal(validateClimateData(dataset).ok, true);
  const result = response();
  await makeHandlers(dataset).health({}, result);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { status: "ok" });
});

test("health is unavailable when no dataset revision is selected", async () => {
  let calls = 0;
  const handlers = makeHandlers(null, { getClimateData: async () => { calls += 1; return null; } }, null);
  const result = response();
  await handlers.health({}, result);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(calls, 0);
});

test("climate endpoint projects the internal contract and rejects unknown regions", async () => {
  const handlers = makeHandlers(makeDataset());
  const result = response();
  await handlers.climate({ query: { region_id: "test_region" } }, result);
  assert.equal(result.statusCode, 200);
  const body = result.body;
  assert.equal(body.daily.length, 366);
  assert.deepEqual(body.daily[59], { date: "2020-02-29", tmax_c: 24.5, rain_mm: 0 });
  assert.deepEqual(body.units, { tmax: "C", rain: "mm/day" });

  const unknown = response();
  await handlers.climate({ query: { region_id: "other_region" } }, unknown);
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual(unknown.body, {
    error: { code: "UNKNOWN_REGION", message: "This region is not supported." },
  });
});

test("health and climate endpoint reject staging or rejected datasets", async () => {
  const dataset = makeDataset();
  dataset.manifest.status = "rejected";
  const handlers = makeHandlers(dataset);
  const health = response();
  const climate = response();
  await handlers.health({}, health);
  await handlers.climate({ query: { region_id: "test_region" } }, climate);
  assert.equal(health.statusCode, 503);
  assert.equal(climate.statusCode, 422);
  assert.equal(climate.body.error.code, "INSUFFICIENT_DATA");
});

test("same record count cannot hide a missing leap day", async () => {
  const dataset = makeDataset();
  dataset.daily.splice(59, 1);
  dataset.daily.push({ date: "2020-12-31-extra", tmax_c: 24.5, rain_mm: 0 });
  dataset.manifest.validation.record_count = 366;
  const result = validateClimateData(dataset);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("2020-02-29")));

  const health = response();
  await makeHandlers(dataset).health({}, health);
  assert.equal(health.statusCode, 503);
});

test("invalid dates, duplicate dates, and implausible measurements are rejected", () => {
  const invalidDate = makeDataset();
  invalidDate.daily[0].date = "2020-02-30";
  assert.equal(validateClimateData(invalidDate).ok, false);

  const duplicateDate = makeDataset();
  duplicateDate.daily[1].date = duplicateDate.daily[0].date;
  assert.ok(validateClimateData(duplicateDate).issues.some((issue) => issue.includes("Duplicate")));

  const invalidMeasurement = makeDataset();
  invalidMeasurement.daily[0].tmax_c = 88;
  invalidMeasurement.daily[1].rain_mm = -0.1;
  assert.equal(validateClimateData(invalidMeasurement).ok, false);
});

test("NASA fill markers, invalid numbers, and missing measurements fail readiness", async () => {
  for (const value of [-999, -9999, Number.NaN, Number.POSITIVE_INFINITY, true]) {
    const dataset = makeDataset();
    dataset.daily[0].tmax_c = value;
    const result = validateClimateData(dataset);
    assert.equal(result.ok, false);
  }

  const missing = makeDataset();
  missing.daily[0].rain_mm = null;
  missing.manifest.validation.complete_years = [];
  const health = response();
  await makeHandlers(missing).health({}, health);
  assert.equal(health.statusCode, 503);
});

test("database outage returns service unavailable from health and climate endpoints", async () => {
  const repository = { getClimateData: async () => { throw new Error("database unavailable"); } };
  const handlers = makeHandlers(null, repository);
  const health = response();
  const climate = response();
  await handlers.health({}, health);
  await handlers.climate({ query: { region_id: "test_region" } }, climate);
  assert.equal(health.statusCode, 503);
  assert.equal(climate.statusCode, 503);
  assert.equal(climate.body.error.code, "SERVICE_UNAVAILABLE");
});

