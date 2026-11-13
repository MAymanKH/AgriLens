# Role 4 | App Developer: The Three-Screen Product

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. The verified demo shows their plan and **two valid alternatives**; other valid inputs may have fewer alternatives. Plans are compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. MongoDB is agreed for backend persistence; languages, frameworks, hosting, and design tools remain owner choices.


## What this job actually means

Build the **working interface farmers or judges will click**. It must be clear, responsive and connected to the Technical Lead's public Comparison API. You **display** the provided water, heat and soil findings; you do not calculate or invent them.

**You own:** `app/`, navigation between the **exactly three screens**, data entry, public API requests, charts, responsive behavior, keyboard/form accessibility and recovery from loading/errors. No prescribed frontend technology.

## The exact screens you must implement

### Screen 1: Setup

- Title: **Compare crop rotations**. Show the **one supported region**, already selected, as a sample.
- Four season-compatible crop controls: **Year 1 Summer / Winter; Year 2 Summer / Winter**. Pre-fill a verified example.
- One **priority** selection: **Less water**, **Less heat exposure**, **More crop diversity**.
- Main **Compare rotations** button; helpful invalid-selection message; keep the user's input after failures.
- Keep **More crop diversity** as the approved `soil` priority. Do not add a separate soil-input field without an approved public contract change and sourced rule.

### Screen 2: Compare

- Show **up to three easy-to-scan options**: Your rotation, Lower-water alternative, More-diverse alternative. The checked demo displays all three; other valid inputs may return fewer, with an explanation instead of empty or duplicate cards.
- On each card show the four crops, **water-demand range + unit**, **historical hot-day exposure + heat threshold**, **qualitative diversity/soil note**, and a one-sentence reason. Mark the preferred option only if the API supplies defensible evidence.
- **Edit choices** returns to Setup without wiping inputs. **See details & stress test** goes to Screen 3.
- For a narrow/mobile screen, stack the cards or use a clearly labeled selector. Keep aligned units and readable numbers.

### Screen 3: Details & historical stress test

- Scenario switcher: **Historical average / Hottest recorded year / Driest recorded year**.
- Compare heat exposure of **the returned plans** in one simple chart or compact table; show scenario year/period, threshold, units and legend.
- Expandable **Why these options?**, **NASA data and method**, **Sources and limitations** sections with clickable references.
- **Back to comparison** and **Edit choices**; preserve selection. If a scenario fails, explain it and keep the previous valid view.
- Do not dynamically change fixed crop-water estimates across climate scenarios unless the API explicitly computes them with an approved method.

**No other MVP screens:** No landing page, dashboard, login, settings, profile, tutorial or national map.

## API connection and behavior

- Use **only** the Lead's public `GET /api/config` and `POST /api/compare`. Never call Climate or Crop internal endpoints.
- The request contains `region_id`, four baseline crop IDs in order, `priority` (`water|heat|soil`), and `scenario` (`average|hottest_year|driest_year`).
- The response contains `plans[]` (1-3 valid entries; the normal demo has 3) with stable IDs `baseline`, `water_conscious`, `diverse`; per-plan `crops[]`, `water_need_mm{min,max}`, `hot_days`, `soil_note`, `reasons`, `source_ids`; and `meta{heat_threshold_c,climate_period,scenario_year,sources,assumptions,limitations,warnings}`.
- Treat every numeric `null` as **Not evaluated**, not `0`. Show unit labels. Do not show fixture numbers as verified real results.
- Implement clearly named states for loading, invalid inputs, service failure, missing-source values, no valid alternative, and an unsupported historic scenario. A **Try again** action must preserve previous choices.

## Required fallback states

- If `plans[]` has one or two entries, render only the returned plans and show the API's `meta.warnings`. Never fabricate the missing alternatives.
- For a failed or unsupported scenario switch, keep the **last successful scenario** visible and explicitly label it, while explaining that the requested one is unavailable. Never present previous numbers as newly computed results.
- Invalid inputs are explained next to controls; keep inputs and offer correction. If services are down, preserve the last valid view when safe, label it, and offer **Try again**; never replace results with fixture numbers.
- Use `null` as **Not evaluated** and display sources/limits. Follow the standard error shape and canonical fields from `START_HERE.md`; the Lead approves changes to the public API.

## Tasks and checkpoints

- **T+0-3:** Agree on screen order, field names, sample fixtures and contract with UI/UX and Lead. Set up a runnable app shell with navigation and one mock response.
- **T+3-8:** Implement Setup first from the early design handoff; then implement Compare and Details using fixtures. Connect buttons, preserve user inputs and show placeholder/loading/error states.
- **T+8-12:** Complete mock-driven three-screen interaction and responsive layout. Give UI/UX real screens to review; resolve text/label mismatches.
- **T+12-22:** Connect real `/api/config` and `/api/compare`; make the full user journey work with Research-checked data and clickable sources.
- **T+22-30:** Improve keyboard/mobile layout, charts, errors and performance. Support user testing and screen recording. Freeze features at T+30.
- **T+30-36:** Fix blocking defects, verify public/demo build and capture final screenshots for the presentation.

**If two app developers:** Developer A owns Setup + shared navigation/input state; Developer B owns Compare + Details/charts. Agree at T+3 on the single API client and UI components; test the whole journey together. Neither should independently rewrite the other developer's contract.

## Done when

Two people unfamiliar with the project can choose a rotation, compare options and find the source/limitations without coaching. The displayed values match the API and do not silently change; mobile layout, buttons and error recovery work. A real end-to-end example succeeds by **T+22**.

## Starting references

- [W3C WAI: Form labels](https://www.w3.org/WAI/tutorials/forms/labels/) - clear input/select controls.
- [GOV.UK: Error messages](https://design-system.service.gov.uk/components/error-message/) - give specific recovery instructions.
- [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) - keep scientific details off the first two screens.

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
