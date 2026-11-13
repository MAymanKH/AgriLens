# Role 1 | Backend Technical Lead: Comparison & Decision Engine

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. Users see their plan and **two valid alternatives**, compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. No technology stack is prescribed.


## What you are responsible for

You are the person who turns the climate and crop data into **three sensible crop rotations that users can compare**. You own the hardest logic, the app-facing API, integration, and final demo reliability. The other two backend developers supply clean data; **you do not fetch NASA data or research individual crops yourself**.

**You own:** `services/comparison/`, public `GET /api/config` and `POST /api/compare`, rotation validity and generation, metrics, ranking, explanations, integration tests and backend deployment coordination.

## Exact work, in order

- **T+0-3:** Agree on the one region, four slots, allowed priorities, heat threshold, historical-window method and API fields with Research and the app owner. Publish a **working example request, response, and mock fixtures** from the other services. Set the rule for winter crops spanning December-January.
- **T+3-12:** Build a Comparison API against **mock Climate/Crop responses**. Check season compatibility, keep the user baseline unchanged, generate two **distinct valid** alternatives, and calculate sourced water-range totals and qualitative crop-diversity notes. Support clear invalid-input errors. Start a reproducible test suite.
- **T+12-22:** Connect live internal Climate and Crop APIs. Count historical heat-threshold days across each crop's approved growing window; use complete comparable seasons and documented average/hottest/driest scenario rules. Rank or explain options by the selected priority, but keep trade-offs visible. Deliver the **first real end-to-end response** to the app and have Research independently check it.
- **T+22-30:** Integrate the complete UI journey, handle unavailable services, source metadata, bad parameters and missing data; deploy with a repeatable start procedure. Freeze new features at T+30.
- **T+30-36:** Fix only blockers, support demo recording, test deployment/public access and provide clear method/limitations for the pitch.

## Interfaces you own

**Public:**

- `GET /api/config`: supported region, slot order, available crops by season, priorities, historical scenarios, sample baseline. Only include a soil selector if it actually affects a documented calculation.
- `POST /api/compare`: accept the user's four-crop baseline, priority and climate scenario; return the baseline and two alternatives with comparison values, units, reasons, references and uncertainty.
- `GET /health`: service status.

**Request fixture (identifiers are illustrative, not approved crop records):**

```json
{
  "region_id": "sample_region",
  "baseline": ["summer_a", "winter_a", "summer_b", "winter_b"],
  "priority": "water",
  "scenario": "average"
}
```

`priority`: `water | heat | soil`; `scenario`: `average | hottest_year | driest_year`. A soil property is optional **only after Research approves a real rule**.

**Response shape (placeholder fields are not measurements):**

```json
{
  "region_id": "sample_region",
  "priority": "water",
  "scenario": "average",
  "plans": [
    {"id":"baseline", "crops":[], "water_need_mm":{"min":null,"max":null},
      "hot_days":null, "soil_note":"", "reasons":[], "source_ids":[]},
    {"id":"water_conscious", "crops":[], "water_need_mm":{"min":null,"max":null},
      "hot_days":null, "soil_note":"", "reasons":[], "source_ids":[]},
    {"id":"diverse", "crops":[], "water_need_mm":{"min":null,"max":null},
      "hot_days":null, "soil_note":"", "reasons":[], "source_ids":[]}
  ],
  "meta": {"heat_threshold_c":null, "climate_period":"", "scenario_year":null,
    "sources":[], "assumptions":[], "limitations":[], "warnings":[]}
}
```

The **verified demo input** must produce exactly three complete plans. For other valid inputs, return **one to three** plans (baseline plus only distinct, season-valid alternatives) and add an explanation in `meta.warnings` when fewer than three exist. Never repeat or invent a rotation. Keep these IDs stable even if display order changes; add a clear best-fit indication only if it is defensible. Unknown metric = `null` + an explanation, **not zero**. Ensure every quantitative value has an explicit unit and defensible method. Do not claim a scientifically guaranteed global optimum.

**Internal inputs you consume:**

- `GET /internal/climate?region_id=sample_region` returns validated daily `{date,tmax_c,rain_mm}`, selected complete-year historical scenarios, metadata and NASA source.
- `GET /internal/crops?region_id=sample_region` returns crop IDs, valid seasons, growing windows, indicative water ranges (mm per growing period), crop families, legume flags and source references.

No imports from another service's source or database. Use API fixtures until their endpoints are ready. Agree on any field changes directly with both owners and the App Developer.

## Failure rules and decision authority

- Reject invalid baseline/crop/region/priority with the standard public error shape from `START_HERE.md`. Never "fix" an invalid baseline silently.
- If a baseline is valid but only 0-1 alternatives satisfy approved rules, return the valid subset with `meta.warnings` rather than duplicating cards. If core validation evidence is missing, use `INSUFFICIENT_DATA` and do not recommend an unverified rotation.
- If a historical scenario is unavailable, report `UNSUPPORTED_SCENARIO` or `INSUFFICIENT_DATA`; do not swap in the average response while claiming it is the hottest/driest year.
- Keep previously checked, clearly identified cache for outages only when region/period/provenance match approved decisions. Fixtures are never a production fallback.
- You maintain the **canonical contracts and approved-decision table in `START_HERE.md`**. Before merging a public field change, require App approval; for internal fields require the providing service and yourself. Research approves changes to scientific meaning. Update affected examples and tests at once.

## Required test cases

- Normal **verified demo** input produces **three distinct, season-valid rotations**, including the user's baseline exactly; another valid input with fewer alternatives returns only those available and a clear warning.
- Reject unknown region/crop, invalid season, malformed four-slot input and unsupported priority/scenario.
- Independently reproduce one water-range sum and one crop-window heat-day count by hand with Research.
- Handle winter windows across a year boundary, missing NASA days, unavailable source fields and an internal service outage.
- Switching priority/scenario changes the evidence or has a clear explanation for unchanged numbers. Stable tie-breaks and preserved source IDs.

## Handoffs and limits

**To App:** API fixtures by **T+3**, mock-driven endpoint by T+12, verified real response by T+22. **From Climate and Crop:** independent APIs, fixtures, completeness/source checks by T+12. **From Research:** approved crop facts, calendar dates, accepted heat-threshold and method by T+12-22. **To Storytelling:** one checked example with short reasoning by T+22.

Do not build extra features (accounts, forecasts, profit/yield or numerical soil-health predictions). If only one metric is fully defensible, show it properly rather than inventing others.

## Useful sources

- [Official Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/) - what the product must solve.
- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) - available climate series and limitations.
- [FAO: indicative crop water needs](https://www.fao.org/4/s2022e/s2022e07.htm) - interpretation of ranges and their limitations.
