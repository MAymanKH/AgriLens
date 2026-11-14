# Role 2 | Backend Developer: NASA Climate Service

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. The verified demo shows their plan and **two valid alternatives**; other valid inputs may have fewer alternatives. Plans are compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. MongoDB is agreed for backend persistence; languages, frameworks, hosting, and design tools remain owner choices.


## What this job actually means

Turn NASA's historical weather records into a **clean, repeatable data source** for the Comparison Engine. You own obtaining, checking, storing/caching and serving the climate series. **You do not choose crops, create rotations, or rank plans.**

**You own:** `services/climate/`, `GET /internal/climate`, climate fixtures/tests, source metadata and climate error handling. You can develop independently using the agreed region and response structure.

## Tasks and checkpoints

- **T+0-3:** Agree with Research and the Technical Lead on **one region and coordinates**, a usable history period, required NASA parameters/units, missing-value rules, and year-selection definitions. Provide a sample JSON response **clearly marked as a fixture**.
- **T+3-12:** Download/cache real daily maximum temperature and precipitation for the region from NASA POWER. Normalize dates/units; reject missing, duplicate or invalid records; keep the original source URL, spatial resolution, time standard and collection date. Provide a first real dataset and metadata. Deliver the independently runnable `GET /internal/climate?region_id=...` and `GET /health` by T+12, including scenario metadata computed under the approved rules.
- **T+12-22:** Integrate the working service with Comparison. Have Research independently verify **hottest** and **driest** complete historical year selections and boundary/missing-data cases. Confirm that implementation follows the year/window convention agreed by T+3; report unresolved decisions rather than choosing defaults.
- **T+22-30:** Fix completeness, reproducibility and service errors. Ensure the live demo **does not rely on a fresh NASA request**. Provide source details and climate explanations to Research and Storytelling.
- **T+30-36:** Support integration, fix critical failures and verify that the delivered source/period/units match the numbers shown in the app.

## Your service contract

`GET /internal/climate?region_id=sample_region` and `GET /health`.

**Response shape; placeholders are not data:**

```json
{
  "region_id": "sample_region",
  "coordinates": {"lat": null, "lon": null},
  "period": {"first_year": null, "last_year": null},
  "units": {"tmax": "C", "rain": "mm/day"},
  "daily": [{"date": "YYYY-MM-DD", "tmax_c": null, "rain_mm": null}],
  "scenarios": {
    "hottest_year": {"year": null, "rule": "Pending Research-approved hottest-year rule"},
    "driest_year": {"year": null, "rule": "Pending Research-approved driest-year rule"}
  },
  "provenance": {"source_url": "", "retrieved_at": "", "missing_days": null,
    "spatial_resolution": "", "time_standard": ""}
}
```

The lead counts crop-specific hot days using **your daily time series**. A historical scenario year is a reference to past weather, not a prediction. Report data gaps; never replace missing observations with zero or made-up values. Select years only from complete periods; resolve ties consistently. If consecutive two-year windows are needed for winter slots, flag any incomplete paired windows rather than pretending they are complete.

**Error example:** `{"error":{"code":"UNKNOWN_REGION","message":"This region is not supported."}}`.

## Data availability and decisions

- The agreed historical period, coordinates, complete-year rule, cross-year winter interpretation, and scenario tie-breaks must be approved and recorded in `START_HERE.md` by T+3. Use a fixture if these are still Pending; do not silently select a different region/year.
- Publish `UNSUPPORTED_SCENARIO` or `INSUFFICIENT_DATA` when a selected historical period is not complete; **never fill missing daily NASA observations with zero** or label an unverified year "hottest" or "driest".
- The live service should use a saved, verified NASA dataset with provenance so the demo does not depend on a live download. If no matching cache exists, return a clear `SERVICE_UNAVAILABLE`/`INSUFFICIENT_DATA` error, not dummy values.
- The Technical Lead consumes your endpoint and must explicitly approve any change to its shared fields; Research signs off any scientific-method change.

## Independent deliverables and proof

- Cached original NASA response and cleaned daily series, plus a short note on parameter IDs, selected years, time standard, units and missing-data treatment.
- A live, independently runnable service with a health check, a sample successful fixture and an invalid-region fixture.
- Automated checks for duplicate/missing dates, invalid region, complete-year selection and deterministic output.
- The Lead can use your fixture at **T+3** and real data by **T+12**, without touching your private code or storage.

**Ask Research:** Are the place/period/source defensible? **Ask Lead:** Are the field names and scenario conventions compatible? You should not be blocked waiting for their implementations.

## Starting references

- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) - request parameters, time conventions and data limits.
- [NASA POWER parameters](https://power.larc.nasa.gov/docs/tutorials/parameters/) - verify actual parameter names and measurement units.
- [NASA POWER data access viewer](https://power.larc.nasa.gov/data-access-viewer/) - useful for checking the series manually.

## Local development handoff

Use [the runtime defaults](../docs/RUNTIME.md) and [synthetic HTTP fixtures](../fixtures/README.md) now. No additional implementation agreement is required to start. Owners may change private code/storage while preserving the shared APIs. The Lead owns integration and ranking; Research owns scientific evidence and methods.

## Unreviewed prototype scenario handoff, 2026-11-13

The backend-completion instruction extends only the unreviewed prototype convention.
Comparison now offers average plus hottest/driest **eligible rotation anchors** from
complete calendar years with complete four-slot coverage across every offered rotation.
Retained data gives eligible anchors 2016–2023, hottest 2023 and driest 2019. Climate's
internal full-record annual extremes remain 2024/2025. Public stress responses disclose
the eligible set, selection rule and full-record extremes in assumptions/warnings.
Consumers must display that scope rather than describe these as absolute record years.
No JSON fields change. Live-mode rules and pending scientific review remain unchanged.
See `START_HERE.md` and `docs/METHOD.md` for the authoritative exception.

## Long-term heat context handoff, 2026-11-14

The owner requested a visible integration of PR #2. Follow the additive
`historical_reference` contracts in `START_HERE.md`: Climate serves the separately
pinned 1991–2020 reference only in unreviewed mode; Comparison measures the same
returned rotations across common complete windows; App shows a summary, chart,
exact-value table, sources and research limitations in Details. Existing scenarios,
ranking and water estimates remain unchanged. Current calendars allow 28 complete
start years, 1991–2018. Missing or corrupt reference data shows unavailable without
substituting data or breaking the current comparison. Scientific approval stays
pending; the 2026 probe is not integrated.
