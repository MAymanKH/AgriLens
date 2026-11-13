# AgriLens | Scientific Method and Reproduction Notes

Owner: Research (Role 06). Updated 2026-11-13 in response to PR #1 import review.

`START_HERE.md` remains the shared authority. The detailed calendar/exposure rules below are an executable **proposal for Lead, Climate, Crop and App approval**. They resolve ambiguities in the branch; they do not record scientific sign-off or authorize live results. Source verification is tracked in `docs/SOURCES.md` and `docs/EVIDENCE_REVIEW.md` when present. Structural validation is not scientific approval.

## 1. What the numbers mean

The pilot is Zankalon, Egypt (`zankalon_sharkia`, 30.58057 N, 31.43332 E). The retained NASA POWER daily response covers 2016-01-01 through 2025-12-31, 3,653 dates. Its header specifies **LST**, not an interchangeable UTC/LST convention. POWER is gridded meteorological input, not an on-farm weather station measurement. Do not describe grid differences as demonstrated local microclimates.

`water_need_mm` is an indicative range in mm per crop growing period. Sum the four lower endpoints and the four upper endpoints separately. Keep the same range across scenarios until a different method is approved. A difference between range endpoints is arithmetic over assumptions; it does not establish actual irrigation savings, a probability interval, or farm delivery. If a component's evidence is unresolved, the live aggregate is Not evaluated (`null`).

Reference ET0, crop evapotranspiration ETc, puddling/percolation, and irrigation delivery are separate quantities. The ingestion script derives ET0 using a FAO-56 Penman-Monteith implementation from Tmax, Tmin, RH2M, shortwave radiation and WS2M, assuming elevation 10 m and daily ground heat flux zero. Humidity is approximated using daily mean RH. This implementation and its units need independent FAO-56 review before scientific acceptance. ETc = Kc * ET0 additionally requires supported stage lengths and Kc values. The mere presence of stage coefficients in JSON does not establish a validated stage model. No generic 200–400 mm rice addition or ditch-loss percentage is accepted here without exact supporting evidence and applicability.

## 2. Proposed executable exposure/calendar convention

The public `hot_days` is **whole growing-window exposure at a common Tmax >=35 C threshold**, not a count restricted to flowering, actual crop damage, or a comparison of crop-specific tolerances. The common threshold permits a consistent exposure comparison. Catalog thresholds of 32/35/36/38 C are candidate crop attributes pending evidence review; they do not override this public calculation. A >=38 C diagnostic is a separate metric and must not silently substitute for `hot_days`.

The shared API contains months, not planting/harvest dates. Therefore use inclusive **whole months**: first day of `start_month` through last day of `end_month`. If start month exceeds end month, end in the following calendar year. Ignore free-text descriptions such as “15 May” or “10 May” for computation; they are candidate agronomic details requiring an approved contract change if needed. Do not quietly clip partial months.

For anchor year n, map four slots as follows:

| Slot | Sowing/window-start year | Cross-year harvest |
|---|---|---|
| y1_summer | n | same year |
| y1_winter | n | n+1 |
| y2_summer | n+1 | same year |
| y2_winter | n+1 | n+2 |

Count actual calendar dates, including February 29 when present. For each slot, count dates with Tmax >=35 C; sum slot counts. This is crop-day exposure, so overlapping windows would count a date once for each crop. **A field rotation with overlapping full-month windows is not validated:** identify the conflicting slots and require Crop/Research/Lead calendar resolution before recommending it. Do not trim, deduplicate, shift a planting date, or claim an intercropping system without evidence. Arithmetic overlap diagnostics are not valid recommendations.

Require every date in every requested crop window to exist with valid non-sentinel inputs. Missing coverage gives `INSUFFICIENT_DATA` (HTTP 422); an unadvertised scenario gives `UNSUPPORTED_SCENARIO`. Never wrap dates into another year or substitute a complete year's weather. Keep previous UI results only under the previously successful, clearly labelled scenario.

## 3. Scenario selection and availability

Calculate annual mean daily Tmax and annual precipitation totals from complete calendar years only. Select greatest mean Tmax for hottest; select least precipitation for driest. On exact ties, choose the earliest year. Select first, then check all four slot windows: do not select a different year merely because it has enough following winter data.

The retained raw cache independently gives hottest **2024**, driest **2025**, and **2025 rain 39.81 mm**. The older 39.80 mm statement is a rounding/transcription discrepancy: summing the retained decimal daily values gives 39.81. This is a raw-cache correction, not a new measurement.

With the proposed four-slot year mapping, a 2024 anchor's last winter ends in **2026**, and a 2025 anchor's last winter ends in **2027**; even the first 2025 winter needs 2026. The cache ends in 2025. Both four-slot historical stress scenarios are therefore **unavailable**, although their annual selection statistics are computable. Do not advertise them as complete live comparisons.

For `average`, calculate each four-slot exposure for each complete anchor in 2016–2025, exclude anchors missing any required date, then take the arithmetic mean of those per-anchor totals. Do not calculate exposure on mean temperatures: thresholding and averaging do not commute. For the current cross-year windows the complete anchors are **2016–2023 (eight)**; this is not ten complete two-year rotations. Keep `scenario_year=null` and disclose anchors and count in assumptions. Calendar-year climate summaries can still cover all ten complete years, but they are different statistics. Preserve fractions in the calculated mean; approve any UI rounding explicitly.

## 4. Independently reproduced raw-cache checks

Run `python scripts/check_research_benchmarks.py`. It reads the retained raw NASA response directly, does not import generator/ingestion calculation functions, does not rewrite data, and does not declare scientific approval. It verifies parameter coverage/fill values and independently calculates annual selections and the following example:

- Maize full-month window 2024-05-01 through 2024-09-30: **153 dates**, **135 days with Tmax >=35 C**.
- The candidate legacy baseline `maize, wheat, rice, wheat` has per-anchor crop-day exposure **302, 324, 329, 327, 328, 315, 308, 317** for anchors 2016–2023; arithmetic mean **318.75**. These are diagnostic numbers only: the month-based baseline has **31 overlap days** (May/October), so it is not an approved field rotation.
- Anchors 2024 and 2025 yield unavailable exposure because coverage is missing; no fabricated zero or substituted year.
- Wheat sown November 2023 includes February 29, 2024. Equal scenario scores select the earliest year.

The cached catalog arithmetic, retained only to make the review reproducible, is:

| Candidate sequence | Sum of candidate water endpoints (mm) |
|---|---|
| maize, wheat, rice, wheat | 2300–3500 |
| maize, faba_bean, soybean, wheat | 1750–2650 |
| cotton, berseem, soybean, sugar_beet | 2200–3500 |

These totals inherit unresolved crop-range evidence and calendar overlaps. They are **not approved live outputs**. Rice's conditional catalog flag does not prove the sample farm's legal eligibility. The proposed shortlist and evidence review must establish that before any rice recommendation.

## 5. Language and acceptance limits

Say only that crop families and legume presence differ. Avoid claims of severe nitrogen depletion, guaranteed organic-matter restoration, salt management, compliance, or quantified soil improvement without direct applicable evidence. Qualitative diversification principles do not establish outcomes on this farm.

The annual climate statistics and independent arithmetic do not complete the Research role: exact source page/table support, crop scope approval, chronological rotation validity, reviewed ET0/Kc calculations, real service outputs, App screens, and presentation claims still require review. No scientific decision is approved by running this checker.
