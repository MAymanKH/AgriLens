# AgriLens: NASA data and weather investigation

Investigated 2026-11-14 for Zankalon (30.58057 N, 31.43332 E). This is a research recommendation, not a scope/API/science approval. Research initially inspected aae933b; PR packaging is based on main ae76a7b; root scope is three screens and historical comparison, with scientific inputs pending review. Existing approved/candidate product files were not changed by this investigation.

Follow-up: the complete 1991–2020 download has now passed coverage/basic QA for all six variables (10,958 dates, 65,748 values). See [the full-period audit](research/power_1991_2020/README.md); earlier sample-only statements below describe the initial investigation stage. Scientific/source-consistency approval is still pending.

## Recommended direction

Prioritize completing historical coverage, adding meaningful heat-event metrics, and showing a dated recent-weather summary. Then investigate HLS crop-calendar evidence and IMERG rainfall context. Keep soil-moisture and ECOSTRESS outputs at the spatial scale the evidence supports. Treat NASA forecasts as a separate research feature requiring Lead approval and validation, not an implicit replacement for the historical stress test.

NASA-produced products often incorporate partner observations and models: HLS includes ESA Sentinel-2, and NASA forecast/reanalysis products assimilate many observing systems. “NASA data” can honestly mean NASA-produced/distributed products; it cannot imply every underlying observation was made by a NASA satellite. No commercial weather provider is needed for the options below.

## What was actually checked

NASA documentation was reviewed alongside the repository's source/method/shortlist and research audit brief. Public CMR collection/granule queries were run at the Zankalon point for 2024-05-01 through 2024-10-31. POWER point requests checked 1991, 2026 and hourly access. Exact URLs, metadata and outcomes are retained in [the API audit](research/nasa_api_probe_2026-11-14.json). Public metadata access does not prove authenticated raster retrieval or quality-screened farm coverage.

| Direct check | Result | Interpretation |
|---|---|---|
| POWER 1991-01-01–07, six existing daily variables | Seven nonfill entries per variable; solar source includes SRB | Initial availability probe; the subsequent full-period audit passed (see linked follow-up) |
| POWER 2026-01-01–05-31 | 151 exact dates for all six variables; finite numeric, nonfill; Tmin<=Tmax | Can supply the currently missing final winter for a 2024 four-slot anchor, subject to dataset/method approval |
| POWER 2026-11-01–07 | Seven nonfill entries per variable; GEOSIT/FLASHFLUX sources | Recent weather exists; it is a delayed analysis, not today's live station reading |
| POWER hourly 2024-05-01–02 | 48 entries each for T2M, RH2M, T2MDEW, WS2M, PS and solar | Hourly humidity/temperature analysis is technically accessible; no whole-season audit yet |
| HLS L30 / S30 v2 | 40 / 37 granule matches | Discovery evidence only; these are NOT 77 clear days or valid crop pixels |
| ECOSTRESS LST v2 / ET v2 | 33 / 5 granule matches | ET is much sparser than LST in this tested window |
| ECOSTRESS LST v3 / ET v3 | 0 / 0 matches | New collection exists but did not supply this point/period in the probe; no inference about other dates/sites |
| SMAP L4 SMGP v8 | 1,475 granule matches | Includes time-interval boundary intersections; not 1,475 independent local soil observations |
| IMERG Final half-hourly v07 | 8,832 matches; collection metadata end 2025-09-30 | Historical product exists here; nominal “present” coverage must not substitute for inspected availability |

The 2026 January–May response is retained separately in [research-only raw data](research/power_zankalon_2026_jan_may_probe.json). No existing NASA cache was overwritten. This checks coverage/structure, not scientific accuracy or field representativeness.

## 1. Longer and more complete climate history — highest priority

Propose a reference climate period of 1991–2020, plus a separate recent comparison such as 2016–2025. NASA POWER meteorology extends back to 1981; solar history uses different source eras. The initial 1991 probe established access; the subsequent full-period audit verified exact date coverage and basic QA for all six variables. Review source changes and coverage before computing trends or ET0 comparisons. [POWER daily service](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [meteorological sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/), [NASA solar source history](https://ntrs.nasa.gov/api/citations/20210023687/downloads/ASA-CSSA-SSSA_2021_Final.pdf).

Benefits: more independent years for historical variability; compare recent heat exposure to a longer reference; quantify how often a rotation meets its chosen exposure criterion. Distinguish empirical frequency from a future event probability. Do not choose one unusually favorable reference period after seeing results.

The most immediate repair is smaller: append a separately validated 2026 supplement to support a 2024 anchor's final winter. Our exact 151-day January–May check succeeded. A 2025 anchor still requires 2027 winter observations, which do not exist as historical observations on the inspection date. Never fill that missing winter with forecast/projection values while keeping the same historical label.

## 2. Weather features that can use existing NASA forcing

| Aspect | Proposed metric | Why it helps | Evidence/validation gate |
|---|---|---|---|
| Heat persistence | Longest consecutive run of Tmax>=35 C and event dates | Distinguishes a sustained event from isolated hot days | 35 C remains a screening convention, not universal crop injury |
| Heat intensity | Sum max(0,Tmax-35), in degree-days | Distinguishes slightly from strongly above-threshold days | Disclose daily-max metric; not hourly heat dose |
| Warm nights | Tmin distribution and count above a justified crop threshold | Adds conditions missed by daytime-only exposure | Choose biological threshold from crop evidence; otherwise show distribution |
| Cold/frost context | Tmin distribution or subzero-air-temperature events | Relevant to winter establishment where supported | Grid air temperature does not prove frost on a particular field |
| Dry atmosphere | Hourly vapor-pressure deficit derived from temperature/dew point | Describes atmospheric drying demand | Verify derivation/units; label modeled grid statistic, not crop damage |
| Seasonal drying demand | Sum daily FAO-56 reference ET0 | Integrates radiation, temperature, wind and humidity | Reference ET0 differs from actual ET and irrigation delivery |
| Rain timing | Crop-window total, event concentration, longest dry spell | More informative than annual “driest year” alone | Approve wet-day threshold; do not infer irrigation deficit |
| Calendar sensitivity | Repeat exposure for justified sowing-date alternatives | Tests whether exposure conclusions depend on month choices | Need exact dates/cultivar stages and Lead-approved semantics |

Hourly access is verified for 48 hours, including dew point and pressure. Request response units rather than guessing: the tested daily solar field reports MJ/m^2/day, while the tested hourly field reports MJ/hr. Preserve the returned unit string and verify the scientific conversion before use. LST is local solar time; it is not the Africa/Cairo civil timezone and does not automatically include daylight-saving changes.

A weather-context card in Details can show the last completed seven days, data-through date, retrieval time, source/grid scale and missing-data state. POWER documents typical latency of 2–3 days for meteorology and 5–7 days for solar, so a card must not imply real-time readings. Never make a six-variable calculation appear newer than its slowest valid input. [POWER data FAQ](https://power.larc.nasa.gov/docs/faqs/data/).

## 3. Short-range, seasonal and climate forecasts are different options

| Horizon | NASA product | Suitable question | Recommendation |
|---|---|---|---|
| Days | GEOS-FP analysis/forecast | What modeled heat/rain/wind conditions might occur over the next few days? | Research preview only after explicit scope approval |
| Weeks to months | GEOS-S2S-3 ensembles | Is a season more likely to be anomalously hot/wet/dry relative to model climatology? | Later investigation; evaluate Egypt hindcast skill and calibration |
| Decades | NEX-GDDP-CMIP6 / POWER Projection API | How might multi-year exposure differ under emissions scenarios? | Longer-term adaptation research; never tomorrow's weather |

NASA's NCCS page advertises ongoing five-day GEOS-FP forecasts at approximately 0.3 x 0.25 degrees. Other GMAO product descriptions distinguish cycle-dependent five/ten-day horizons; inspect the actual run metadata rather than promise a horizon. GMAO explicitly describes GEOS forecasts as experimental research products and advises against nonresearch use. No current forecast run was downloaded or validated in this investigation. An operational farm warning system is not justified by the documentation check. [NCCS GEOS-FP](https://www.nccs.nasa.gov/geos5-forecast/), [GMAO product notice](https://gmao.gsfc.nasa.gov/gmao-products/geos-near-real-time-data-products/).

GEOS-S2S-3 was released in March 2026 and provides ensemble predictions on longer horizons. Assess retrospective forecast performance for the intended region, season and variable before using a probability. Archive issue time, valid time, lead, version and members. [GEOS-S2S-3](https://gmao.gsfc.nasa.gov/gmao-products/geos-s2s-3/), [GMAO product list](https://gmao.gsfc.nasa.gov/gmao-products/).

A useful discovery is NASA POWER's documented Projection API: daily/monthly NEX-GDDP-CMIP6 data for 2015–2100, nearest 0.25-degree cell, ensemble or model selection, and SSP126/245/370 choices. Availability and missing values must be checked per request; only the documentation was checked here. Compute exceedances per model/member before summarizing them: thresholding an ensemble-mean temperature series can suppress extremes. [Projection API](https://power.larc.nasa.gov/docs/services/api/projection/). NASA describes the underlying climate dataset as intended for research and recommends expert consultation for other applications. [NASA NEX-GDDP-CMIP6](https://www.nasa.gov/ames/earth-science/nasa-earth-exchange-nex/gddp/downscaled-climate-projections-nex-gddp-cmip6/).

## 4. More NASA Earth observations worth considering

| Product | Scale/time | Decision-support use | Limit and priority |
|---|---|---|---|
| HLS v2 L30/S30 | 30 m reflectance; repeat frequency and latency differ | Verify observed green-up/harvest patterns; describe vegetation-cover continuity | High-value validation after obtaining real polygons and crop labels |
| GPM IMERG v07 | 0.1-degree, half-hour precipitation estimates | Regional rain-event context and historical rainfall cross-check | Medium priority; measures rainfall, not irrigation |
| SMAP L4 v8 SPL4SMGP | 9 km, three-hour modeled/assimilated surface/root-zone moisture | Regional moisture anomaly relative to a matching seasonal reference | Context only for tiny Delta fields; not a farm water-content reading |
| ECOSTRESS LST / ET | 70 m overpass-scale surface temperature and modeled ET | Matched-stage cluster thermal/ET comparisons and model checking | Conditional validation; QA, pixel support, time of day and date coverage first |
| GLDAS | Model land-surface water/energy variables | Broader modeled moisture/ET context or sensitivity analysis | Lower priority where overlapping products add little independent information |

HLS uses NASA and ESA imagery harmonized to 30 m. Apply Fmask/cloud/shadow/aerosol screening, then count clear dates and valid interior pixels per crop polygon. The global median revisit is not a guarantee of cloud-free farm observations. A 30 m pixel is 0.09 ha; a 70 m pixel is 0.49 ha geometrically, with effective information also affected by the sensor and processing. Small parcels can contain no unmixed interior thermal pixels. [HLS products](https://hls.gsfc.nasa.gov/data-products/), [access and Earthdata login](https://hls.gsfc.nasa.gov/data-access-and-tools/).

IMERG Early/Late/Final provide different latency and adjustment regimes. Early is roughly four hours, Late roughly fourteen hours, and Final typically several months; research comparisons should use a consistently selected run/version. Convert half-hour rate units to accumulations correctly. Our Final collection metadata stopped in September 2025, despite later dates in other products, so a 2026 card would require a separately checked recent run. [GPM FAQ](https://gpm.nasa.gov/resources/faq), [NASA IMERG overview](https://science.data.nasa.gov/disasters/data-gallery/gpm-imerg-precipitation).

SMAP root-zone moisture is model-assisted, not a direct satellite measurement at root depth. Use a consistent version, QA and seasonal reference; irrigated conditions require local applicability checks. SMAP and other NASA products can share rainfall/model inputs, so agreement is not automatically independent validation. [SMAP v8 user guide](https://nsidc.org/data/documentation/smap-l4-global-9-km-ease-grid-surface-and-root-zone-soil-moisture-version-8-user-guide), [latency table](https://nsidc.org/data/user-resources/help-center/what-are-latencies-smap-radiometer-data-sets).

ECOSTRESS v3 exists, but the actual probe returned no matches for the chosen site/period. v2 matches must still pass product QC and temporal/spatial support checks. Compare similar growth stages and overpass times; do not equate LST with air temperature or modeled ET with irrigation deliveries. [NASA v3 ET product](https://data.nasa.gov/dataset/ecostress-tiled-evapotranspiration-pt-jpl-instantaneous-and-daytime-l3-global-70-m-v003), [v2 grid/tile user guide](https://lpdaac.usgs.gov/documents/1655/ECO_L1C-4_Grid_Tile_User_Guide_V2.pdf). GLDAS output variable meanings also distinguish instantaneous stores from fluxes/accumulations. [NASA GLDAS output definitions](https://ldas.gsfc.nasa.gov/gldas/model-output).

## 5. Other aspects to cover — and boundaries of NASA-only evidence

- **Robustness across years:** show per-year dispersion, not only a mean and one extreme. Report complete-anchor count and ranking stability; missing coverage must not improve an alternative's apparent score.
- **Growth-stage alignment:** NASA temperature observations help only if planting, cultivar duration and flowering/harvest dates are defensible. Current crop-specific thresholds/Kc and faba water evidence remain a higher-priority gap than adding a new sensor.
- **Water definitions:** keep indicative requirement, derived reference ET0, modeled/observed actual ET, rain, effective rain and delivered irrigation separate. ET0-minus-rain is a climatic context index, not a farm irrigation prescription.
- **Vegetation/soil cover:** HLS can support a cover or phenology proxy with suitable QA and labels. It cannot establish measured soil carbon, nitrogen gains, salinity recovery, pest infestation or yield from greenness alone.
- **Farm constraints:** crop families, residue handling, equipment, water access, rice permission, market/forage needs and field-clearance intervals can decide whether a rotation is feasible. NASA observations cannot supply all of these facts. NASA-only environmental forcing is possible; a complete scientific farming recommendation still requires agricultural and local evidence.
- **Regional water context:** GRACE/GRACE-FO, reservoir/surface-water products and broad drought indicators are possible future context. They do not establish this farm's irrigation allocation or extraction. Leave them outside the current farm ranking unless a scale-appropriate decision use is established.
- **Terrain/drainage:** NASA elevation data can provide landscape context, but do not resolve canal operation, field leveling or soil infiltration sufficiently to prescribe irrigation in the Delta. Exclude unsupported precision.
- **Wind, aerosols and compound heat/dryness:** investigate descriptive NASA time series where relevant; biological damage, spray timing, disease and operational thresholds need separate evidence and validation. Avoid adding them just because variables exist.

## 6. Scope-aware plan and acceptance

Recommended first package: validated 2026 winter supplement; heat-wave duration/intensity; historical distributions; dated recent-weather context; missing-coverage explanations. Keep these within Setup -> Compare -> Details if approved, without adding screens. Proposed metrics/metadata require affected consumer agreement before any API change. Research should approve formulas and labels; Climate owns acquisition/QA; Lead owns scenario/ranking decisions; App/UX owns presentation.

Second package: HLS calendar validation for actual AOIs, followed by an IMERG rain cross-check. Add SMAP/ECOSTRESS only when meaningful pixel/date support is demonstrated. Forecasts, seasonal outlooks and climate projections are later research features requiring explicit scope approval; they must remain distinguishable from historical results.

For each accepted product retain: request URL, actual source grid cell, version/science version, AOI, period, time standard, native units, fill/QA rules, raw checksum, retrieval/data-through time, aggregation formula, completeness and coverage report, and evidence approval. For forecasts also retain initialization/valid/expiry times and issue-to-issue revisions. No silent recent/final, model-version, scenario-year or NASA-product substitution.

Checks before adoption: a manually reproduced metric; missing-variable/null/nonfinite/missing-date failures; leap/cross-year/overlap cases; unit/timezone conversion; stale/weather-unavailable UI; matched references for anomalies; and scale-appropriate validation independent of shared model inputs. A forecast additionally needs hindcast/archived forecast evaluation by lead time and comparison against a simple baseline, with calibration checks before displaying probabilities.

Investigation limits: challenge resources URL did not load in the web tool, so this is not a claim to have retrieved every official resource. No authenticated HLS/SMAP/ECOSTRESS raster extraction or plot-level QA was performed, and no forecast skill was demonstrated. The concrete availability probes are recorded separately; nominal product documentation and tested site availability are kept distinct. These research files have not been committed or pushed.
