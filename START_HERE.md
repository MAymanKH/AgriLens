# AgriLens | Project source of truth

**Purpose:** one realistic, source-backed crop-rotation comparison for a verified Egyptian region, developed within 48 hours. This document is the **authority for shared decisions, API fields, failure rules, and project-level acceptance**. Each `roles/*.md` file is a self-contained task guide; `AGENTS.md` explains how AI agents work with this project. Use the matching `pdf/*.pdf` when sharing a role with a teammate.

**Document priority:** `START_HERE.md` (approved decisions and shared contracts) > `AGENTS.md` (team/agent process) > `roles/*.md` (role tasks, examples, and acceptance tests). If examples or screenshots disagree with an approved contract, fix them instead of maintaining competing versions.

## 1. Product and boundaries

A farmer or agricultural advisor chooses a two-year sequence of four crops and a priority. AgriLens compares that **unchanged baseline** to **up to two distinct, season-valid alternatives**, using indicative water needs, historical NASA POWER heat exposure, and **qualitative** diversity/soil notes. The normal verified demo sample must show three plans. When alternatives cannot be validated, show fewer plans and explain why; **never invent or repeat an option just to fill a card**.

The only three screens are **Setup -> Compare -> Details & historical stress test**. Setup uses one preselected region and four slots in order: `y1_summer`, `y1_winter`, `y2_summer`, `y2_winter`. Priorities: `water`, `heat`, `soil` (displayed as Less water, Less heat exposure, More crop diversity). Scenarios: `average`, `hottest_year`, `driest_year`. Historical years illustrate past conditions, **not future forecasts**.

**Out of scope:** logins, national coverage, mapping, dynamic crop prices, yield/profit prediction, measured irrigation savings, numerical soil-health scores, hardware, and unapproved science claims. MongoDB is agreed for backend persistence. No language, framework, hosting provider, or design tool is mandated.

## 2. Approved decisions and open decisions

At T+3, the Technical Lead records the team's choices here with Research's sign-off for scientific assumptions. An entry marked **Pending** is **not permission to guess**; developers may work with clearly labelled mock data until it is approved. Do not silently replace an approved value with a local default.

| Decision | Current rule/value | Status | Decision owner / required sign-off |
|---|---|---|---|
| App flow | Exactly three screens; four slots, baseline + at most two alternatives | Approved | Technical Lead + App + UI/UX |
| Backend persistence technology | MongoDB, as confirmed by the Technical Lead on 2026-11-13; no language, framework, or hosting choice implied | Approved | Technical Lead reports team agreement |
| MongoDB storage design | [Service-owned, versioned snapshots](docs/database/README.md) as implementation defaults; owners can adapt private storage without changing APIs | Adopted by Technical Lead, 2026-11-13 | Service owners implement; no separate schema sign-off gate |
| Local prototype runtime | [Runtime defaults](docs/RUNTIME.md): Comparison 8000, Climate 8001, Crop 8002; local MongoDB 27017 without authentication | Adopted by Technical Lead, 2026-11-13 | Backend owners implement; Lead integrates |
| Development fixtures | [Synthetic HTTP cases](fixtures/README.md); runnable independently of Research data and MongoDB | Development only; never scientific approval | Lead maintains tooling; owners use cases for implementation |
| Slot order | `y1_summer`, `y1_winter`, `y2_summer`, `y2_winter` | Approved | Technical Lead |
| Priorities and scenarios | `water/heat/soil`; `average/hottest_year/driest_year` | Approved | Technical Lead + Research |
| Region name, ID and representative coordinates | Zankalon, Sharkia Governorate, Egypt (`zankalon_sharkia`), Lat 30.58057° N, Lon 31.43332° E (Zankalon Water Research Station EG-ZAN) | Pending evidence review (PR #1) | Research proposes; Technical Lead approves |
| Supported crops, crop IDs and allowed seasons | 8 candidate crops (final 4-6 shortlist pending): Summer (`maize`, `rice`, `cotton`, `soybean`), Winter (`wheat`, `berseem`, `faba_bean`, `sugar_beet`); see `data/processed/crop_catalog.json` | Pending evidence review (PR #1) | Research approves; Crop owner publishes |
| Historical period, NASA parameters and completeness rule | 2016-01-01 to 2025-12-31 (10 complete years); NASA POWER `T2M_MAX, T2M_MIN, RH2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, WS2M` with derived FAO-56 $ET_0$; 0 missing days | Pending evidence review (PR #1) | Climate owner proposes; Research approves |
| Heat threshold and growing-window calendar rule | Proposed common Tmax >=35°C whole-month exposure, not flowering-stage damage; see `docs/METHOD.md`. Crop-specific thresholds and calendar applicability remain pending | Pending evidence review (PR #1) | Research approves; Technical Lead implements |
| Hottest/driest scenario selection and tie-breaks | Hottest: 2024 (mean Tmax 31.79°C, 117 days >= 38°C); Driest: 2025 (total rain 39.81 mm, ET0 1996.3 mm); complete years only | Pending evidence review (PR #1) | Climate + Research; Technical Lead approves cross-year semantics |
| Water demand and soil wording | mm/growing period; totals as ranges; diversity/legume notes are qualitative. Proposed ET0/Kc calculations and crop-specific facts remain pending | Approved method; crop-specific facts pending | Research approves facts; Technical Lead uses them |

Research review status (2026-11-13): PR #1 identified unsupported source mappings and ambiguous calendar semantics. The scientific rows above are candidate inputs pending Research evidence review and Lead recording of approval. Structural checks cannot approve them. See `docs/SOURCES.md`, `docs/CROP_SHORTLIST_PROPOSAL.md`, and the proposed executable convention in `docs/METHOD.md`. No public contract change is approved by these proposals.

**Decision update template:** `Decision | New approved value/rule | Evidence/source | Owner | Affected endpoints/screens | Approved at T+N`. Put each approved change in the table or its linked method note. Record changes in a dated commit; if a decision is unsettled at T+3, mark it Pending with an owner and a safe workaround, rather than leaving team members to assume.

### Comparison implementation decision, 2026-11-13

The project owner instructed implementation to proceed without approval workflow.
The Lead's [Comparison service](services/comparison/README.md) implements the current
public contract and the whole-month >=35°C prototype convention in `docs/METHOD.md`.
This instruction does not constitute Research sign-off or change the Pending evidence
statuses above. Comparison accepts successful internal HTTP responses without an
additional approval gate; Crop and Climate retain their existing dataset-serving rules.

Rotation windows must not overlap. Average heat exposure uses common complete anchors
across all valid offered rotations. Historical stress years are selected before testing
four-slot coverage; incomplete selections are unavailable. Alternatives use deterministic
priority ranking and a second descriptive-diversity selection, as documented in the
service README. No shared API field or scientific approval status changes here.

## 3. Shared API contracts (authoritative)

These are the common field names and meanings. **Examples are structural, not real agricultural results.** No service may change these silently. Additional optional fields are allowed only if consumers can ignore them safely.

### Public API, owned by Technical Lead

- `GET /api/config`: serves one region, the permitted crops, priority/scenario choices and a sample baseline. Only advertise scenarios backed by approved data and methods. Its agreed response shape is:

```json
{
  "region":{"id":"sample_region","name":"Example region"},
  "slot_order":["y1_summer","y1_winter","y2_summer","y2_winter"],
  "crops_by_season":{"summer":[{"id":"summer_a","name":"Example summer crop"}],
                     "winter":[{"id":"winter_a","name":"Example winter crop"}]},
  "priorities":["water","heat","soil"],
  "scenarios":["average","hottest_year","driest_year"],
  "sample_baseline":["summer_a","winter_a","summer_a","winter_a"]
}
```

- `POST /api/compare` request:

```json
{"region_id":"sample_region","baseline":["summer_a","winter_a","summer_b","winter_b"],"priority":"water","scenario":"average"}
```

- `POST /api/compare` response (minimal, illustrative shape):

```json
{
  "region_id":"sample_region","priority":"water","scenario":"average",
  "plans":[
    {"id":"baseline","crops":[],"water_need_mm":{"min":null,"max":null},"hot_days":null,"soil_note":"","reasons":[],"source_ids":[]},
    {"id":"water_conscious","crops":[],"water_need_mm":{"min":null,"max":null},"hot_days":null,"soil_note":"","reasons":[],"source_ids":[]},
    {"id":"diverse","crops":[],"water_need_mm":{"min":null,"max":null},"hot_days":null,"soil_note":"","reasons":[],"source_ids":[]}
  ],
  "meta":{"heat_threshold_c":null,"climate_period":"","scenario_year":null,
          "sources":[],"assumptions":[],"limitations":[],"warnings":[]}
}
```

`plans` has **1-3 entries**: the baseline first if valid, followed by **zero to two distinct valid alternatives**; the normal checked demo has 3. `baseline`, `water_conscious` and `diverse` are stable IDs, not claims that each plan is objectively best. Every `crops` array contains **exactly four crop IDs in slot order** in a real response. A source in `meta.sources` has at least `{id,title,url}`; each `source_ids` entry refers to one of these IDs. `null` means **Not evaluated**, not zero. Include human-readable reasons for missing metrics or omitted alternatives in `meta.warnings`. Never change water-demand values between historical scenarios unless the team has approved a scenario-dependent method.

### Internal APIs, owned by their service developers

- `GET /internal/climate?region_id=...` returns `region_id`, `coordinates{lat,lon}`, `period{first_year,last_year}`, `units{tmax,rain}`, `daily[{date,tmax_c,rain_mm}]`, `scenarios{hottest_year{year,rule},driest_year{year,rule}}`, `provenance{source_url,retrieved_at,missing_days,spatial_resolution,time_standard}`.
- `GET /internal/crops?region_id=...` returns `region_id`, `slot_order`, `crops[{id,name,valid_seasons,grow_window{start_month,end_month},water_need_mm{min,max},family,is_legume,source_ids}]`, `sources[{id,url,supports}]`.
- All services expose `GET /health`. The app only calls the **public** API; the Comparison Engine calls the two internal APIs, not their databases or code.
- Standard error shape: `{"error":{"code":"INVALID_INPUT","message":"Explain what to fix."}}`. Use stable codes `INVALID_INPUT`, `UNKNOWN_REGION`, `UNSUPPORTED_SCENARIO`, `INSUFFICIENT_DATA`, `NO_VALID_ROTATION`, `SERVICE_UNAVAILABLE` as appropriate. Response messages should be safe to display to a user.

**Contract change rule:** The owner proposes the exact field/meaning change; the Technical Lead checks the public effect; **every affected consumer** explicitly agrees before merging (App for public; Comparison Engine for internal). Research also approves changes to scientific meaning. Update this section, fixtures, impacted role files, and tests **in the same change**. Otherwise keep the current contract and use adapters/fixtures.

Local HTTP status codes, addresses, configuration, startup entrypoints, and timeouts are defined in [the runtime guide](docs/RUNTIME.md). These are Lead-set prototype defaults, not an additional agreement gate. Scientific approvals and shared-contract change control still apply.

## 4. Failure and fallback policy

| Situation | What the system does |
|---|---|
| User selects invalid crop, season or region | Reject with `INVALID_INPUT` or `UNKNOWN_REGION`; preserve input and say what to change. |
| No second/third valid rotation | Return baseline plus only genuinely valid alternatives (1-2 total if necessary); `meta.warnings` explains the shortage; UI hides unavailable cards. If baseline is invalid, reject it. |
| Crop fact or season support not verified | Exclude unsupported crop/rotation from recommendations; don't infer compatibility or fill values. |
| Some quantitative evidence missing | Use `null` and `Not evaluated` with explanation and source limitation. Continue only when rotation validity is still verifiable. |
| Unsupported or incomplete historical scenario | Don't claim a new result. Disable the option or return `UNSUPPORTED_SCENARIO` / `INSUFFICIENT_DATA`; on screen keep the previous **clearly labelled** successful scenario. |
| NASA source slow or down | Use a previously checked local cache **only for the same approved region/period**, with provenance. If no valid cache exists, show unavailable state; never substitute fixtures as live data. |
| Crop/Climate service is down | Use approved cached data only when freshness/provenance can be demonstrated; otherwise show a retryable `SERVICE_UNAVAILABLE` error. |
| Demo deployment unavailable | Use a recorded run and previously verified screenshots, explicitly labelled as a recording rather than a live result. |

If the core sample cannot produce two credible alternatives, **reduce crop scope or revisit approved inputs before T+22**, rather than relaxing crop-validity rules or inventing crops. A failing source does not justify invented measurements.

## 5. Project-wide definition of done

- [ ] Exactly **one approved region** with recorded representative coordinates, 4-6 sourced crops and a working four-slot sample baseline.
- [ ] A user can complete **Setup -> Compare -> Details** without coaching; input survives Back, Edit choices and retry.
- [ ] The **verified demo sample** returns baseline plus **two distinct, season-valid alternatives**, and the UI handles fewer options safely for other inputs.
- [ ] Average and any advertised hottest/driest historical scenarios are reproducible from checked NASA POWER records, with units, years, caveats and direct source links.
- [ ] Water ranges and heat-day calculations have **at least one independently reproduced example each**; source IDs resolve; diversity/soil claims stay qualitative.
- [ ] Missing evidence, an unavailable scenario, an invalid crop and a service outage display truthful, recoverable states rather than invented values.
- [ ] The runnable app, Comparison API, Climate service and Crop service all pass independent checks and one real end-to-end test.
- [ ] Mobile and desktop views are usable, with source/limitations easy to locate; **two unfamiliar people** can explain the three plans after trying the flow.
- [ ] Slides, short video, project page and backup recorded demo use **Research-approved numbers**, include sources/limitations, and have working access permissions.
- [ ] No unapproved new features after **T+30**; reviewed and shareable package ready at **T+36**. All timing is measured since kickoff, not by date.

## 6. Roles, ownership and handoffs

| Role file | Ownership | Required handoff |
|---|---|---|
| `roles/01_Backend_Technical_Lead.md` | Rotation logic, ranking/justification, public API and integration | Fixtures T+3; sample comparison T+12; integrated real results T+22 |
| `roles/02_Backend_NASA_Climate.md` | NASA data, validation, climate scenarios, cache, internal API | Fixture T+3; validated series and service T+12 |
| `roles/03_Backend_Crop_Agriculture.md` | Approved crop catalog, planting windows and internal API | Fixture T+3; verified catalog and service T+12 |
| `roles/04_App_Developer.md` | Three interactive screens, public API, responsive/error UI | Mock flow T+12; real complete journey T+22 |
| `roles/05_UIUX_Designer.md` | Designs for the exact three screens and usability review | Setup T+5; other screens T+8; ongoing testing T+30 |
| `roles/06_Research_Data.md` | Source ledger, region/crop approvals, independent math/claim checking | Decisions and candidate shortlist T+3; initial sourced records T+5; catalog T+12; checks T+22 |
| `roles/07_Storytelling_Presentation.md` | Narrative, slides, video, demonstration, submission readiness | Outline T+12; edited media T+30; verified package T+36 |

**Timing:** T+0-3 align decisions/fixtures. T+3-12 build services, mock screens and media outline. T+12-22 integrate and validate one real journey. T+22-30 polish and freeze. T+30-36 fix critical blockers and finalize; reserve remaining time for contingency.

**Source-backed statements:** NASA POWER daily climate data and definitions: https://power.larc.nasa.gov/docs/services/api/temporal/daily/ and https://power.larc.nasa.gov/docs/tutorials/parameters/ ; FAO crop calendar: https://cropcalendar.apps.fao.org/ ; FAO crop-water needs: https://www.fao.org/4/s2022e/s2022e07.htm . See each role file for its additional starting references.
