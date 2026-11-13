# AgriLens | Model Handoff

Use this file as a fast orientation guide. Before changing anything, read `START_HERE.md`, then `AGENTS.md`, then the role guide for the owned area. If this file and those sources disagree, `START_HERE.md` controls shared decisions, contracts, failure rules, and acceptance. Confirm current GitHub and workspace state; this handoff records a point-in-time inspection from 2026-11-13.

## Project in one paragraph

AgriLens is a NASA Space Apps project for comparing a farmer's four-slot, two-year crop rotation in one research-backed pilot region. It should compare an unchanged baseline with up to two distinct, season-valid alternatives, using sourced indicative crop water ranges, historical NASA POWER heat exposure, and qualitative crop diversity/soil notes. The intended product has exactly three screens: Setup, Compare, and Details with a historical stress test. The app calls only the public Comparison API; Comparison consumes separate Climate and Crop internal APIs.

## Authoritative project rules

- Read order: `START_HERE.md` -> `AGENTS.md` -> the assigned `roles/*.md` file. Root shared contract beats illustrative examples and role mirrors.
- Do only the assigned owner's area. Technical Lead owns rotation generation, scoring/ranking, public API, and integration. Climate and Crop serve validated inputs. App calls Comparison only. Research approves evidence and scientific claims. Presentation owns story and media.
- Shared slot order: `y1_summer`, `y1_winter`, `y2_summer`, `y2_winter`. Priorities: `water`, `heat`, `soil`. Scenarios: `average`, `hottest_year`, `driest_year`.
- Canonical public endpoints: `GET /api/config`, `POST /api/compare`; internal endpoints: `GET /internal/climate?region_id=...`, `GET /internal/crops?region_id=...`; all services expose `/health`.
- Compare response has 1-3 plans. A valid baseline can stand alone; never repeat or invent alternatives to fill cards. Missing numeric evidence is `null` / “Not evaluated,” never zero. Use standard error envelope and stable codes from `START_HERE.md`.
- Fixtures are synthetic and development-only. Never present them as NASA measurements or use them as a live outage fallback. Cache use requires matching approved region/period and provenance. Historical scenarios are not forecasts.
- No made-up savings, forecast, profit, yield, or numeric soil-health claims. Water values are indicative crop needs, not measured farm irrigation or delivery. Keep soil/diversity wording qualitative.
- Shared API or scientific-meaning changes require exact proposal, affected consumer agreement, Research sign-off when scientific, and same-change updates to source of truth, role mirrors, fixtures, and tests.
- Project-wide acceptance is in `START_HERE.md` §5; a role checklist passing alone is not product completion. At every handoff report changed files, run/review instructions, example or screenshots, verification evidence, sources/assumptions, blockers, and next owner.

## Candidate research snapshot (PR #1 evidence review pending)

- Region: Zankalon Water Research Station, Sharkia, Egypt; `zankalon_sharkia`; 30.58057 N, 31.43332 E; elevation 10 m.
- Climate: NASA POWER daily `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `ALLSKY_SFC_SW_DWN`, `WS2M`, 2016-01-01 through 2025-12-31. The branch states 3,653 complete days and derives FAO-56 reference ET0; NASA POWER does not directly provide this ET0 value.
- Scenario anchors in project docs/data: hottest year 2024; driest year 2025. Heat thresholds are 35 C for flowering exposure and 38 C for extreme stress. Preserve the method distinction and verify relevant calculations before presenting real outcomes.
- Eight catalog crops: summer `maize`, `rice`, `cotton`, `soybean`; winter `wheat`, `berseem`, `faba_bean`, `sugar_beet`. Rice has a conditional regulatory status; don't treat an unknown canal command's permission as established.
- Water ranges, grow windows, crop families, sources, scenario definitions, caveats, and worked examples are in `data/processed/crop_catalog.json`, `docs/METHOD.md`, `docs/SOURCES.md`, and `docs/AUDIT_AND_DECISION_RECORD.md`. Raw source artifacts are under `data/raw/`.
- Primary evidence IDs include `SRC-NASA-POWER-DAILY`, `SRC-FAO-CROPWATER`, `SRC-ZANKALON-SUGITA-2017`, `SRC-SPRINGER-WATER-PROD-2024`, `SRC-FAO-CALENDAR-EG-DELTA`, `SRC-FAO-SPECIES-DIVERSIFICATION`, `SRC-MWRI-RICE-REGULATION`, `SRC-USDA-COTTON-EG`, and `SRC-ICARDA-LEGUMES-MENA`. Resolve IDs and use source ledger links before making claims.

## Repository map

- `START_HERE.md`: binding shared product scope, decisions, API shapes, fallbacks, acceptance, role ownership, and timing.
- `AGENTS.md`: instructions for teammates and coding agents; follows the user-provided instructions embedded for this workspace.
- `roles/01...07_*.md`: individual briefs for Technical Lead, NASA Climate, Crop Agriculture, App, UI/UX, Research, and Storytelling/Presentation.
- `docs/METHOD.md`, `docs/SOURCES.md`, `docs/AUDIT_AND_DECISION_RECORD.md`: research methodology, evidence ledger, and research/site audit.
- `docs/RUNTIME.md`: fixture/local runtime, ports, environment, service startup contract, and MongoDB defaults.
- `docs/database/README.md`, `mongodb-schema.md`, `implementation-handoff.md`: storage architecture and proposed MongoDB schemas/lifecycle; these are implementation guidance, not proof services currently exist.
- `data/raw/`: NASA POWER JSON, FAO calendar JSON, MOA berseem source text/PDF, USDA cotton PDF. `data/processed/`: Zankalon region config, crop catalog, cleaned climate series, and example MongoDB documents. `data/fixtures/`: data-layer mock responses.
- `fixtures/`: synthetic API response JSON and `cases.json` matrix for Comparison, Climate, and Crop HTTP behaviors. `fixtures/README.md` documents profiles and their synthetic assumptions.
- `scripts/`: research data construction/fetch/query, validation, and schema compliance. Read the script's inputs/outputs before running it; see cautions below.
- `tools/`: dependency-free Python fixture generator, local fixture HTTP server/launcher, and verification utilities. These do not implement production comparison logic or real backend services.
- `setup/`: currently untracked local setup materials, including duplicate role markdown/PDF exports and bundled optional skills. Treat as user data: do not clean, overwrite, or assume its copies supersede root project sources. PDFs correspond to role guides; no additional source of shared API authority.
- There is no root `README.md`, package manifest, app directory, `services/` directory, or `media/` directory in the inspected tree. These are planned by docs, not present deliverables at this snapshot.

## Local skills bundled in `setup/maybe usefull skills (for dev)/`

These are optional repo-local skill copies, not project API/spec authorities. Apply a skill only when its task is relevant; their files remain the detailed instructions.

- `auto-commit`: commit workflow and guardrails; says personal guides should not be committed absent an explicit request.
- `blast-radius`: assess the impact and confidence of changes; hand back affected areas and checks.
- `bro`: tiny placeholder file with no substantive skill content.
- `code-review`: review a fixed diff against both standards and originating spec, then aggregate separate reviews.
- `diagnosing-bugs`: reproduce/minimize first, hypothesize, instrument, fix, and add regression coverage.
- `grilling`: challenge a plan/decision through questions and critique.
- `how`: explain or critique mode, with explorer/explainer/critic prompts and rubric under `references/`.
- `improve-codebase-architecture`: explore and report architecture opportunities before choosing an implementation; includes an HTML report template.
- `show-me-your-work`: maintain an auditable decision log; includes a TSV template and shell helper.
- `tdd`: test-first workflow and guidance on seams, mocking, tests, and anti-patterns.
- `technical-writing`: documentation style guidance (Diátaxis, clear sentences, ambiguity, repo voice, review checklist).
- `unslop`: edit prose to remove generic, vague, repetitive, or inflated language.
- `setup/roles/md/` duplicates role guides for sharing; `setup/roles/pdf/` holds their PDF exports.

## Runtime and verification

Python 3.10+ is enough for the included tools; fixture servers need no third-party packages. From repo root:

```sh
python tools/dev.py fixtures
python tools/dev.py fixtures comparison --profile one_plan
python tools/dev.py fixtures climate --profile missing_day
python tools/generate_fixtures.py
python tools/verify_fixtures.py
python tools/verify_runtime.py
python scripts/validate_research_data.py
python scripts/verify_schema_compliance.py
```

Fixture ports are Comparison 8000, Climate 8001, Crop 8002. The normal fixture response uses `sample_region` and example crop IDs; it is intentionally separate from Zankalon research data. Runtime docs specify native MongoDB 8.0 for future persistence, but fixtures don't use it. Verification commands were not run during this handoff review.

## Current Git and PR visibility (inspected 2026-11-13)

- Local branch: `data-research-zankalon`, tracking `origin/data-research-zankalon`; HEAD `6777af9` (`feat(data): add verified Zankalon research datasets, NASA POWER series, and canonical schemas`).
- Branch is based on `origin/main` at `20b49d7` and has one commit ahead locally/remotely in the fetched refs; it contains a large research/data addition (25 changed files, roughly 77k insertions), not application/services integration.
- Worktree status showed `?? setup/` and no other reported changes. Do not alter or stage that directory without specific authorization.
- The GitHub pull-request listing page returned 404 in the unauthenticated browser. This does not establish that no PR exists: the repo may be private or anonymous access may be blocked. No connected GitHub PR tool or authenticated `gh` CLI was available. PR existence, review requests, comments, CI, and mergeability remain unverified; check the repo's Pull requests page while signed in or use connected GitHub access.
- The supplied NASA Space Apps URL resolves in search to the official 2026 challenge “Field Shift: Adapting Farms with NASA Data.” The search excerpt describes a decision-support tool combining NASA Earth observations with local soil information, crop characteristics, and farmer priorities. The challenge detail/resources page itself did not load in the inspection, so its exact resource list remains unverified. Link: https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/

## Gaps and cautions for the next model

1. The branch is a Research/Data contribution, not a complete product. Planned `services/comparison`, `services/climate`, `services/crops`, `app`, and `media` implementation are absent. The checked fixture server replays prewritten cases; it does not run arbitrary rotations, connect services, or prove a real end-to-end journey.
2. `scripts/build_research_data.py` documents and hardcodes the older Kafr El-Sheikh dataset/region (`kafr_el_sheikh`, 2014-2023, two POWER parameters). Do not treat it as the current Zankalon build path or run it to regenerate the active research data without first reconciling it with `scripts/validate_research_data.py` and the approved contract. Newer dedicated Zankalon scripts are `fetch_and_process_zankalon.py` and `fetch_and_process_climate.py`.
3. Root `START_HERE.md` says eight supported crops, while its project-wide acceptance bullet says “4-6 sourced crops.” Record this as a source-of-truth inconsistency for the Technical Lead; don't silently change the approved catalog or product scope.
4. `docs/METHOD.md` contains “Net Indicative Water Saving” and strongly worded soil/rotation claims in benchmark examples. Product wording must honor `AGENTS.md` and `START_HERE.md`: frame water differences as arithmetic over sourced indicative ranges, never as measured irrigation savings; avoid unsupported certainty about soil depletion, restoration, or regulatory compliance.
5. A checked JSON series or an audit markdown claim is not by itself independent scientific verification. Cite primary sources, preserve grid-scale and methodological limits, and independently reproduce the required examples before using outcomes in the demo.
6. Root `.env.example` uses `DATA_MODE=live`, but no production services exist yet; fixture mode must be explicitly selected by the local launcher. Do not imply live mode currently works.

## Handoff protocol

Before any implementation, state the assigned owner and files in scope, check `git status`, and leave unrelated user work intact. Do not edit shared contracts or research claims as an implementation convenience. Do not commit, push, create/update a PR, or message teammates unless explicitly asked. After an authorized change, report changed files, a reproducible run/review command, actual verification evidence, assumptions/sources, and open blockers.

## PR #1 follow-up (2026-11-13)

Authenticated access confirmed one open PR and one Lead research comment with six requests; there are no submitted reviews, inline comments, commit comments or check runs at the inspected head. See `docs/REVIEW_FOLLOWUP.md`. Scientific candidates are not approved for live use. The executable calendar proposal requires n through n+2; 2024/2025 complete rotation scenarios are unavailable. Read current evidence review and method before relying on earlier snapshot prose.

## Lead integration after aae933b

The earlier repository and backend warnings describe historical snapshots. Current `START_HERE.md` retains the agreed MongoDB/runtime decisions. `build_research_data.py` now uses Zankalon and produces only reproducible staging files; `verify_schema_compliance.py` checks without writing or approving. The Kafr fetch script has been removed. Follow `docs/database/research-staging.md` and the latest integration section in `docs/REVIEW_FOLLOWUP.md` for commands and verification. Scientific proposals remain pending, including faba water and final crop/calendar approval.


PR #1 second review (0794c46) requests complete NASA input validation and stronger four-crop evidence. Read `docs/FOUR_CROP_EVIDENCE.md` and the latest `docs/REVIEW_FOLLOWUP.md`; run the benchmark negative tests and independent rotation checker. Proposed source-backed selections do not overwrite the retained eight candidate estimates or confer approval.
