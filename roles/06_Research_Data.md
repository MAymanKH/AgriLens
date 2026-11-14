# Role 6 | Research & Data Specialist: Evidence and Validation

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. The verified demo shows their plan and **two valid alternatives**; other valid inputs may have fewer alternatives. Plans are compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. MongoDB is agreed for backend persistence; languages, frameworks, hosting, and design tools remain owner choices.


## What this job actually means

Find the **right data for the one region and 4-6 crops**, organize it so developers can use it, and independently verify that the app's results do not make scientific claims the data cannot support. This is **not a one-time Google search**: you validate the service inputs, calculations, screens and final presentation throughout the project.

**You own:** `data/raw/`, `data/processed/`, `docs/SOURCES.md`, `docs/METHOD.md`, review of crop/season facts and quantitative/qualitative claims. Developers own the code and their services.

## Concrete work and checkpoints

- **T+0-3:** With the team, select **one Egyptian region** with usable data and **4-6 candidate crops**. Decide which sources are reliable enough for seasons, growing windows, approximate water ranges, crop family/legume flags and heat threshold. Approve and hand off region coordinates, climate period/parameters, completeness rules, heat threshold, growing-window/calendar method, and scenario-selection definitions by T+3, or record each unresolved item as Pending with its owner and fixture workaround. Open a source ledger: **claim -> value -> unit -> location relevance -> URL -> uncertainty**.
- **T+3-8:** Review the Climate developer's first records against the decisions handed off by T+3. Give the Crop developer **initial approved records by T+5** with seasons/windows and exact references. Share early usable records; do not wait to fill the entire catalog.
- **T+8-12:** Finish the initial approved crop catalog and NASA completeness review. Confirm there are **three distinct, plausible 4-slot rotations** and no unsupported crop/season combinations.
- **T+12-22:** Independently reproduce **one water range total**, **one count of days above the heat threshold**, and the **hottest/driest year selections**. Verify implementation against the average/historical-stress and cross-year winter definitions agreed by T+3. Reject results with missing/unverifiable inputs.
- **T+22-30:** Audit the values displayed across all three screens against service outputs and sources. Finish `docs/METHOD.md` (math and assumptions) and give Storytelling only checked claims. Identify which limitations users must see clearly.
- **T+30-36:** Review the pitch script, slides, video captions, units and attribution. Prepare short answers to "Where did the data come from?", "How accurate is it?", and "What does your score mean?".

## Approval and independent audit rules

- Own the scientific sign-off for the **Pending** decision rows in `START_HERE.md`: the region, crop shortlist, crop calendar, historical period, data gaps, heat threshold, and hottest/driest year logic. The Technical Lead records approved values; do not leave conflicting assumptions in separate role files.
- Verify the sample produces two **genuinely valid** alternatives. If it does not, flag it early and propose source-backed crop changes before T+22; never approve invented compatibility rules.
- Reject a demo claim when its raw source, time period, unit or method is unavailable. Keep missing metrics as **Not evaluated**. Validate at least one no-alternative case and one incomplete-historical-scenario case in addition to the normal example.
- If scientific meaning changes, approve it explicitly before the Technical Lead updates shared contracts and the presentation uses the result.

## What sources and data you must deliver

| Output | Minimum record |
|---|---|
| Region choice | place name, representative coordinates, rationale, NASA grid/resolution caveat |
| NASA series | exact POWER request/source, variables, units, dates, missing-data log, year-selection rules |
| Crop catalog (4-6) | crop ID/name, supported season(s), growing months, water range + **mm/growing period**, family/legume fact, source IDs |
| Scientific method | 4-slot chronology, water-range addition, heat-threshold/day-count method, historical scenario interpretation, limitations |
| Verification | at least three independently checked sample calculations/selections, with inputs and expected results |

**Never present:** guaranteed irrigation savings, yield/profit predictions, measured on-farm soil health, precise field weather or future forecasts. FAO's generic water figures are **indicative needs under assumptions**, not measured Egyptian irrigation use. If soil evidence supports only legume/diversity notes, keep soil output qualitative. If a source is missing, use `Unknown` / `Not evaluated` rather than a guessed number.

## Who gets what, and when

- **Climate Developer:** checked region/coordinates and needed variables by **T+3**, source/completeness review by **T+12**.
- **Crop Developer:** a candidate shortlist by **T+3**, initial sourced records by **T+5**, complete MVP catalog by **T+12**.
- **Technical Lead:** approved heat/calendar/scenario methods by **T+3**; seasonal-validity inputs and viable sample rotations by **T+12**; independent calculation checks by **T+22**. Unresolved approvals remain Pending.
- **UI/UX + App:** approved terms, units and limitation text; validation of displayed results by **T+22-30**.
- **Storytelling:** a sourced, reliable claim sheet by **T+22**, a final media fact-check by **T+36**.

## Proof you finished

Every displayed scientific value is traceable to a raw record, a documented calculation and a source link; missing/uncertain values are clearly marked. At least one person other than the programmer can reproduce the important sample calculations. The slides and video make no stronger claim than the method supports.

## Starting references

- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) - historical daily temperature/precipitation, timing and limitations.
- [NASA POWER parameter definitions](https://power.larc.nasa.gov/docs/tutorials/parameters/) - names and units.
- [FAO Crop Calendar](https://cropcalendar.apps.fao.org/?language=en&pagename=%2Fwelcome.do) - potential planting/harvest windows, check region applicability.
- [FAO: indicative crop water needs](https://www.fao.org/4/s2022e/s2022e07.htm) - broad crop-water ranges and usage limits.
- [FAO species diversification](https://www.fao.org/conservation-agriculture/in-practice/species-diversification/en/) - principles for qualitative rotation notes.

## Start independently

Own `docs/SOURCES.md` including stable source IDs and human-readable titles, and `docs/METHOD.md` including scientific definitions and worked examples. Publish source-backed decisions incrementally in the root register without waiting for a group meeting; the Lead retains the final integration/scope decision. Backend runtime and schema work are not Research responsibilities. Final scientific audits still require actual service outputs, App screens, and presentation drafts.

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
