# Crop shortlist for Lead review

Status: proposal following PR #1 review, 2026-11-13. This is not scientific approval or a replacement for the root decision register. The eight retained catalog records are candidate estimates with explicit evidence gates; `eligible_for_live` is false until exact evidence and scope approval are recorded. Retaining numbers for review does not authorize displaying them as evaluated outcomes.

## Proposed four-crop scope

Propose summer `maize` and `soybean`, winter `wheat` and `faba_bean`. These give two choices in each season, cereal/legume variety, and avoid making rice permission a prerequisite for the demo. Keep `rice`, `cotton`, `berseem`, and `sugar_beet` as additional candidates, excluded from the proposed initial scope. The Lead must approve this scope after Research checks the exact local calendar and water evidence.

| Crop | Available source lead | Current evidence limit |
|---|---|---|
| Maize | FAO Chapter 3, Table 14; WUR GYGA Egypt Table 1 | Generic indicative ET range is not a Zankalon measurement; proposed 15 May–22 September calendar uses 130 elapsed days after sowing (131 inclusive dates) and depends on cultivar and requires approval. |
| Soybean | FAO Chapter 3, Table 14; cached FAO crop code 0327 | Generic crop estimate requires local applicability check; proposed 15 May–11 September calendar chooses a 120-day duration within source envelopes. |
| Wheat | FAO Chapter 3, Table 14; WUR GYGA Egypt Table 1 | Proposed 15 November–30 April calendar must be approved; current retained month field ends May and has not been silently changed. |
| Faba bean | Cached FAO code 0028; Eid 2008 ARC/Sakha Table 2, p. 9124 | Catalog 350–500 remains unsupported. Proposed experimental consumptive-use span 300–420 mm requires explicit approval and is not a generic requirement. |

Primary source: [FAO Crop Water Needs, Chapter 3](https://www.fao.org/4/s2022e/s2022e07.htm), Table 14. It defines crop water need as evapotranspiration under optimal conditions. It does not establish field irrigation delivery, puddling/percolation, or guaranteed savings. Local calendar lead: `data/raw/fao_crop_calendar_EG_delta.json`; record the exact crop/zone row and demonstrate applicability before approval.

The exact source links, pages and proposed date/duration choices are recorded in `docs/FOUR_CROP_EVIDENCE.md`. Its sourced proposals are separate from the retained candidate values used below. In particular, adopting a shorter wheat window or replacing faba bean's water interval requires Research/Lead approval, consumer agreement for changed scientific meaning, and coordinated catalog/method/fixture updates. No arithmetic example here applies those changes implicitly.

## Structural examples for checking

In canonical slot order, the following proposed sequences are distinct and match the existing summer/winter labels:

- Baseline: `maize, faba_bean, maize, wheat`.
- Alternative A: `soybean, faba_bean, maize, wheat`.
- Alternative B: `maize, faba_bean, soybean, wheat`.

Under the proposed whole-month calendar, the first summer ends September, first winter faba bean ends April, second summer ends September, and final wheat begins November. Thus these examples avoid the May overlap that would occur if wheat were followed immediately by a May-start summer crop. Calendar compatibility alone does not prove agronomic suitability: family succession (including soybean/faba bean), pests, cultivar duration and local planting dates still require Research/Crop review. These are review inputs, not approved recommendations or rankings. No promise of two valid alternatives is made before that review.

### Supported-input proposal and independent checks

`data/processed/four_crop_proposal.json` contains exactly four proposed crops and source locations, separate from the original eight candidates. It proposes generic FAO indicative ET intervals for maize (500–800), soybean (450–700), and wheat (450–650 mm/growing period); faba bean water is null because a comparable requirement has not been established. It proposes whole-month windows May–September, May–September, November–April and October–April respectively, with source envelopes and provisional date/cultivar choices recorded for approval. No field is marked approved or eligible for live use.

The independent checker evaluates the three distinct proposed sequences against this supported-input file first. At anchor 2016 each has windows 2016-05-01–2016-09-30 (153 days), 2016-10-01–2017-04-30 (212 days), 2017-05-01–2017-09-30 (153 days), and 2017-11-01–2018-04-30 (181 days), with zero adjacent overlap. **All three water totals are null / Not evaluated** because they contain faba bean. No partial sum is shown as a complete total. This produces reviewable calendar examples without inventing missing crop-water evidence.

### Retained candidate arithmetic diagnostic only

Run `python scripts/check_rotation_examples.py` from the repository root. This checker reads the supported-input proposal and the retained candidate catalog separately and independently constructs inclusive month windows and range sums. The numeric sums below belong only to the retained candidate diagnostic; they are not the supported-input proposal results. It does not import generator or ranking code, change values, or write approval artifacts. `docs/FOUR_CROP_EVIDENCE.md` records the separate primary-source evidence review; arithmetic success cannot substitute for that evidence.

| Proposed sequence | Retained lower-bound sum (mm) | Retained upper-bound sum (mm) | Adjacent overlap |
|---|---|---|---|
| Baseline | 500 + 350 + 500 + 450 = 1800 | 800 + 500 + 800 + 650 = 2750 | 0 days |
| Alternative A | 450 + 350 + 500 + 450 = 1750 | 700 + 500 + 800 + 650 = 2650 | 0 days |
| Alternative B | 500 + 350 + 450 + 450 = 1750 | 800 + 500 + 700 + 650 = 2650 | 0 days |

These are sums of retained candidate estimates. They are not field measurements or independently validated agronomic water requirements. The 50 mm lower-end and 100 mm upper-end differences between baseline and alternatives are differences between interval endpoints, not a measured or guaranteed irrigation saving.

At anchor 2016, all three proposed sequences have the same four month windows: 2016-05-01 through 2016-09-30 (153 days), 2016-10-01 through 2017-04-30 (212 days), 2017-05-01 through 2017-09-30 (153 days), and 2017-11-01 through 2018-05-31 (212 days). A gap in October 2017 is preserved. No day is assigned to two adjacent crops. At anchor 2019 the first winter includes 2020-02-29 and has 213 days; leap dates are retained rather than normalized away.

The executable checks also demonstrate that the original `maize,wheat,rice,wheat` example has 31 overlapping dates, reject a wrong-season example, and keep both plan water bounds null when a crop range is missing. Temperature coverage and historical scenario availability are checked separately by `scripts/check_research_benchmarks.py`; these calendar examples do not make an incomplete 2024 or 2025 anchor available.

## Evidence gates and extra candidates

- Rice: retain 900–1400 mm as a disputed estimate. Table 14 generic rice ET is 450–700 mm; record an actual local source and derivation for any different interval. Keep ET, puddling, percolation and irrigation delivery separate. Permission is unknown until an applicable MWRI decree and farm/canal-command location are matched; the ministry homepage is insufficient.
- Berseem: retain 550–800 mm as pending. Identify a full multi-cut growing-period measurement or derivation and its unit, location, management, cultivar and page/table. Generic clover or legume descriptions do not validate this range.
- Sugar beet: retain 500–700 mm as pending; Table 14's generic 550–750 mm does not establish this interval.
- Cotton: retain as candidate; exact grow-window and water/stage coefficient citations are still required. The October-ending window also requires checking overlap with winter planting.
- Every crop's Kc stages, crop-specific temperature threshold and exact growing dates remain pending exact primary citations. Crop-specific threshold estimates must not silently replace the common public exposure threshold in `docs/METHOD.md`.

The numerical estimates have been preserved in the candidate files for review. A live adapter must gate candidate eligibility and return `null` / Not evaluated or unavailable responses as appropriate; structural validation cannot supply Research sign-off. No new field in these candidate files overrides `START_HERE.md` or authorizes a shared API change.
