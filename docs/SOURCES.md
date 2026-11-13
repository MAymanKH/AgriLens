# AgriLens | Source Ledger and Evidence Review

**Owner:** Research (Role 06). **Reviewed:** 2026-11-13, following [PR #1 research follow-up](https://github.com/MAymanKH/AgriLens/pull/1#issuecomment-6853973529).

`START_HERE.md` remains the shared contract. This ledger corrects citations and records limits; it does not grant scientific sign-off. Existing catalog values remain candidate inputs where evidence is incomplete. A resolved source ID is not proof that every field referring to it is supported.

## Source registry

### `SRC-NASA-POWER-DAILY`

- Title: NASA POWER Daily Temporal API.
- URL: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- Retained artifact: `data/raw/nasa_power_zankalon_2016_2025.json`.
- Supports: returned daily meteorological parameters at the requested representative coordinates, for the dates in that artifact. This is gridded meteorology, not parcel weather measurements. Inspect the raw header/parameter units and time standard rather than inferring them from the filenames.
- Derived ET0 requires a separate calculation and validation; it is not a POWER measurement. Completeness does not establish accuracy or local station validation.

### `SRC-FAO-CROPWATER`

- Title: FAO, Irrigation Water Management: Irrigation Water Needs, Chapter 3: Crop Water Needs.
- URL: https://www.fao.org/4/s2022e/s2022e07.htm
- Exact support: §3.3.4, Table 14, indicative crop evapotranspiration ranges per growing period. These are generic rough estimates, not Zankalon observations or gross irrigation delivery. This page must not be titled as a combined publication of FAO Papers 24, 33 and 56.
- Scope: only the crop/range matches explicitly recorded below. It does not substantiate the disputed catalog ranges by itself.

### `SRC-FAO56-KC`

- Title: Allen et al. (1998), Crop Evapotranspiration, FAO Irrigation and Drainage Paper 56, Chapter 6.
- URL: https://www.fao.org/4/x0490e/x0490e0b.htm
- Exact support: Table 12 (single crop coefficients); Table 11 (stage lengths); equations 62 and 65 (climate adjustments). These are initial standard-condition estimates requiring crop, management, climate and stage choices. They are not locally measured coefficients.

### `SRC-ZANKALON-SUGITA-2017`

- Title: Crop evapotranspiration in the Nile Delta under different irrigation methods.
- Citation: Sugita, M., Matsuno, A., El-Kilani, R. M. M., Abdel-Fattah, A., and Mahmoud, M. A. (2017). Hydrological Sciences Journal **62(10), 1618–1635**.
- Correct DOI / publisher: https://doi.org/10.1080/02626667.2017.1341631
- Repository record: https://tsukuba.repo.nii.ac.jp/records/41521
- Exact support: §2 observation sites; §4 and Figure 1 compare seasonal actual ET and coefficients under specified irrigation treatments; Table 7 compares annual combinations. This is local experimental evidence, distinct from generic FAO ranges. The previously recorded DOI `10.1080/02626667.2017.1390317`, issue and pages were incorrect.
- Limit: no chosen catalog water-range endpoints or complete Kc triples have yet been traced to an exact treatment/table extraction. Do not claim the catalog ranges were measured by this study.

### `SRC-SPRINGER-WATER-PROD-2024`

- Title: Potential Improvements in Crop Production in Egypt and Implications for Future Water and Land Demand.
- Citation: Ayyad, S., Karimi, P., Ribbe, L., and Becker, M. (2024). **International Journal of Plant Production 18, 313–334**. Published 25 June 2024.
- DOI / publisher: https://link.springer.com/article/10.1007/s42106-024-00301-7
- Exact support: abstract and study analysis concern rice, maize, wheat and berseem in Zankalon, with remote sensing indicators and national scenarios. It is not the previously named Water Resources Management article. Do not cite it as direct flux-tower measurement or evidence for cotton/soybean/sugar beet ranges.
- Local measured comparison is discussed with a citation to El-Kilani and Sugita's separate 2017 book chapter; do not conflate that chapter with the Sugita journal article above.

### `SRC-FAO-CALENDAR-EG-DELTA`

- Title: FAO Crop Calendar, Egypt, Delta region (AEZ 001).
- URL: https://api-cropcalendar.apps.fao.org/api/v1/countries/EG/cropCalendar?language=en&aez=001
- Retained artifact: `data/raw/fao_crop_calendar_EG_delta.json`. Exact selectors and limits are below. Calendar bounds describe regional sowing/harvest options; they do not by themselves establish the precise duration of a particular cultivar or rotation compatibility.

### `SRC-FAO-SPECIES-DIVERSIFICATION`

- Title: FAO Conservation Agriculture: Species diversification.
- URL: https://www.fao.org/conservation-agriculture/in-practice/species-diversification/en/
- Permitted scope: general qualitative rationale for diversification. A legume flag or botanical family count does not establish measured soil nitrogen, carbon restoration, yield improvement, pest elimination or salt management on the demo farm.

### `SRC-MWRI-RICE-REGULATION`

- Title: MWRI rice zoning evidence — **pending**.
- URL: https://www.mwri.gov.eg/ (discovery only; no applicable decree retained).
- Required evidence: decree number/date and growing year, official text or annex listing permitted local areas/canal commands, and an auditable match to the sample farm's location. These are currently missing. The existing conditional record establishes neither permission nor prohibition for this farm. Exclude rice from an eligible recommendation until verified; a historical illustrative sequence containing rice must be labelled eligibility unverified.

### `SRC-USDA-COTTON-EG`

- Title: USDA FAS, Cotton and Products Annual, Egypt, EG2026-0003.
- URL: https://apps.fas.usda.gov/newgainapi/api/Report/DownloadReportByFileName?fileName=Cotton%20and%20Products%20Annual_Cairo_Egypt_EG2026-0003.pdf
- Retained artifact: `data/raw/usda_cotton_egypt_2026.pdf`. Exact supporting page for the selected April–October window, Kc values and heat threshold has not been recorded; these claims remain pending. A sector report does not establish a local heat-damage threshold.

### `SRC-ICARDA-LEGUMES-MENA`

- Title: ICARDA grain legume program (discovery reference).
- URL: https://www.icarda.org/research/crop-improvement/grain-legumes
- Exact page/table for the chosen faba-bean water range and thermal threshold is missing. Do not use the program landing page as quantitative evidence.

## Water range reconciliation (mm per growing period)

No disputed value is silently replaced. The candidate column preserves the branch's submitted values; disputed values require evidence/derivation and Research approval before serving a real outcome.

| Crop | Submitted candidate | Exact evidence checked | Disposition |
|---|---|---|---|
| maize | 500–800 | FAO Chapter 3 Table 14, maize row matches | Generic indicative estimate; local applicability still a choice |
| cotton | 700–1300 | Same table, cotton row matches | Generic indicative estimate |
| soybean | 450–700 | Same table, soybean row matches | Generic indicative estimate |
| wheat | 450–650 | Same table, barley/oats/wheat row matches | Generic indicative estimate |
| rice | 900–1400 | Same table says 450–700 for paddy rice | Submitted range unsupported by cited table; pending exact local treatment evidence |
| faba_bean | 350–500 | Same table says 300–500 for generic bean | Generic bean is not species-specific faba evidence; submitted lower bound pending |
| sugar_beet | 500–700 | Same table says 550–750 for sugarbeet | Submitted endpoints pending evidence |
| berseem | 550–800 | No berseem row in Table 14 | Submitted endpoints pending; do not substitute alfalfa |

ET0 is reference evapotranspiration; ETc is modeled crop evapotranspiration; actual ET is an observation/model-specific quantity. Nursery preparation, puddling, seepage/percolation and conveyance/application losses are separate water-accounting terms. The earlier blanket 200–400 mm rice addition has no recorded treatment-specific derivation and remains pending. Differences between two ranges' endpoints are arithmetic differences, not a prediction or guarantee of irrigation savings.

## Coefficient and threshold evidence audit

All numbers below are submitted candidates, not an approval of a locally parameterized ETc model. Kc triples are initial/mid/end.

| Crop | Submitted Kc triple | Submitted threshold C | Evidence status |
|---|---|---|---|
| maize | 0.30 / 1.20 / 0.60 | 35 | FAO56 Table 12 has grain-maize reference coefficients; selected end value and local adjustment need rationale |
| rice | 1.05 / 1.20 / 0.90 | 36 | FAO56 Table 12 rice row is starting evidence; management/climate and end value need justification |
| cotton | 0.35 / 1.20 / 0.70 | 38 | FAO56 Table 12 cotton row has ranges; chosen endpoints/local application pending |
| soybean | 0.40 / 1.15 / 0.50 | 35 | FAO56 Table 12 soybean row is reference evidence; exact triple extraction/local application pending |
| wheat | 0.30 / 1.15 / 0.40 | 32 | FAO56 Table 12 cereal rows; planting/harvest conditions and selection pending |
| berseem | 0.40 / 1.10 / 0.90 | 35 | FAO56 Table 12 clover distinguishes averaged cutting from individual cutting periods; submitted triple not justified |
| faba_bean | 0.40 / 1.15 / 0.35 | 32 | FAO56 Table 12 separates broad/faba bean from dry-bean assumptions; mapping pending |
| sugar_beet | 0.35 / 1.20 / 0.70 | 35 | FAO56 Table 12 sugar beet row is reference evidence; exact end selection/local application pending |

For every listed temperature threshold, an exact primary crop/stage/cultivar source and page/table is **missing**. The shared >=35 C exposure rule can be an explicitly declared common comparison convention, but cannot be described as a verified flowering-stage damage threshold when counted across whole growing months. Public exposure and crop-specific biological thresholds must not be interchanged. Stage lengths and cutting dates are also required before calculating daily stage-dependent ETc.

## Growing window evidence audit

Exact retained-calendar selectors below use `crop.id`, `sessions` and AEZ `001` rather than an invented PDF page. Missing rows or chosen dates remain pending.

| Crop | Submitted window | Retained evidence / unresolved choice |
|---|---|---|
| maize | May 1–Sep 30 | No matching maize entry identified in retained response; primary calendar reference pending |
| rice | May 15–Oct 15 | No matching rice entry identified; primary calendar reference pending |
| cotton | Apr 1–Oct 31 | No matching cotton entry identified; USDA exact page pending |
| soybean | May 15–Sep 30 | `crop.id=0327`, `sessions[0]`: sowing May 1–25; harvest Sep 1–Oct 20. Selected fixed dates need explicit approval; recorded 95–120 day duration differs from 138-day submitted window |
| wheat | Nov 15–May 10 | `crop.id=0373`, `sessions[0]`: sowing Nov 15–30; harvest Apr 25–May 25. Fixed dates are choices within bounds, not exact observed dates |
| berseem | Oct 1–May 31 | No berseem/clover entry identified; multi-cut schedule and exact MOA page pending |
| faba_bean | Oct 15–Apr 30 | `crop.id=0028`, `sessions[0]`: sowing Oct 1–Nov 15; harvest Apr 15–May 1. Fixed dates are choices. Do not use green broad bean `0027` sessions instead |
| sugar_beet | Oct 1–Apr 30 | `crop.id=0033`, `sessions[0]`: sowing Oct 1–20; harvest Apr 10–May 1. Fixed window duration differs from 170–200 days in record |

Month-only API windows do not encode partial months. Research and the Lead must agree whether calculations use whole months or exact days and reject overlapping rotations rather than silently using contradictory durations. See `METHOD.md` for executable method status.

## Review disposition

Citation errors are corrected here. Missing treatment-specific pages, biological thresholds, selected calendars, rice permission, and disputed ranges remain explicit evidence gaps. No source homepage, successful structural test or automatically generated report may mark these gaps approved. Research supplies evidence and signs the exact revision; the Lead records shared scope/method approval before live use.
