# Role 3 | Backend Developer: Crop & Agriculture Service

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. The verified demo shows their plan and **two valid alternatives**; other valid inputs may have fewer alternatives. Plans are compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. MongoDB is agreed for backend persistence; languages, frameworks, hosting, and design tools remain owner choices.


## What this job actually means

Turn Research's approved agricultural facts into a **small, reliable crop catalog** the other developers can query. You decide **whether a crop is valid in a season and what sourced facts describe it**, not which whole rotation is best.

**You own:** `services/crops/`, `GET /internal/crops`, catalog data validation, fixtures, tests and documented source IDs. You do not download NASA climate records or rank plans.

## Tasks and checkpoints

- **T+0-3:** Agree with Research on 4-6 candidate crops for one region; agree with the Technical Lead on four seasonal slots and response field names. Return a labeled fixture even if research is unfinished.
- **T+3-12:** Load approved crop records incrementally: crop ID/name, valid seasons, month-based growing window, indicative water-demand range **in mm per growing period**, crop family, legume indicator and exact references. Mark unknown facts as unknown; do not guess. Deliver the independently runnable `GET /internal/crops` and `GET /health` with the verified catalog by T+12, including season/range validation and explicit winter-window handling.
- **T+12-22:** Integrate the working service with Comparison. Verify invalid crop/season combinations, ranges, and year-crossing winter windows with the Technical Lead. Have Research independently validate one example catalog against the approved rotation-validity assumptions.
- **T+22-30:** Harden bad-request/data errors, check that the public app labels correspond to approved crops and help Research verify all notes about diversity/legumes. Freeze new features at T+30.
- **T+30-36:** Fix blocking data bugs; supply final sources and concise crop/water clarifications for slides and Q&A.

## Your service contract

`GET /internal/crops?region_id=sample_region` and `GET /health`.

**Response shape; placeholder values are not approved agriculture facts:**

```json
{
  "region_id": "sample_region",
  "slot_order": ["y1_summer", "y1_winter", "y2_summer", "y2_winter"],
  "crops": [{
    "id": "example_crop", "name": "Example crop",
    "valid_seasons": ["summer"],
    "grow_window": {"start_month": null, "end_month": null},
    "water_need_mm": {"min": null, "max": null},
    "family": null, "is_legume": null,
    "source_ids": []
  }],
  "sources": [{"id": "source_id", "url": "", "supports": ""}]
}
```

A season might cross December-January. Define clearly how `start_month` and `end_month` map to the two-year rotation; agree on that convention with the Lead. Water ranges are **approximate crop needs**, not measured irrigation applied or guaranteed savings. Keep unknown values `null`, not `0`. Each approved number/claim must be traceable to an identified source, with local applicability checked by Research.

**Error example:** `{"error":{"code":"UNKNOWN_REGION","message":"This region is not supported."}}`.

## Validation and failure rules

- Crop catalog entries must match the **approved** region, crops and slot/season decisions in `START_HERE.md`. If a crop's season or growing window is unverified, keep it out of the eligible set until Research approves it. Never assume a crop fits just to create more alternatives.
- Unknown water ranges, crop-family facts and legume flags remain `null` with the relevant limitation; never turn missing data into zero or a confident soil claim.
- If region or necessary records are unavailable, return a stable `UNKNOWN_REGION` / `INSUFFICIENT_DATA` / `SERVICE_UNAVAILABLE` error. Notify the Lead when the shortage prevents three valid demo plans.
- The Technical Lead is your consuming owner and must approve field-name or meaning changes. Research signs off agricultural assumptions; update the root shared contract and fixtures before merging.

## Independent deliverables and proof

- A working catalog of **4-6 Research-approved crops** and all source links (or clearly flagged unavailable fields).
- Tests for region validity, crop-season compatibility, source ID resolution, impossible water ranges and year-crossing windows.
- A runnable service, health check, successful fixture and invalid-request fixture.
- Mock catalog ready by **T+3**, approved initial catalog by **T+12**, stable integration by **T+22**.

**You need from Research:** crop shortlist, locally applicable seasons/windows, indicative water ranges and sources. **Lead consumes:** your public contract, not your internal files. Never build a second ranking or comparison algorithm.

## Starting references

- [FAO Crop Calendar](https://cropcalendar.apps.fao.org/?language=en&pagename=%2Fwelcome.do) - candidate growing seasons, only where local coverage supports them.
- [FAO: indicative crop water needs](https://www.fao.org/4/s2022e/s2022e07.htm) - range estimates and limitations.
- [FAO crop rotation / species diversification](https://www.fao.org/conservation-agriculture/in-practice/species-diversification/en/) - qualitative legume/diversity reasoning, not a numeric soil score.

## Local development handoff

Use [the runtime defaults](../docs/RUNTIME.md) and [synthetic HTTP fixtures](../fixtures/README.md) now. No additional implementation agreement is required to start. Owners may change private code/storage while preserving the shared APIs. The Lead owns integration and ranking; Research owns scientific evidence and methods.
