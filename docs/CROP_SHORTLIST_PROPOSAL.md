# Crop shortlist for Lead review

Status: proposal following PR #1 review, 2026-11-13. This is not scientific approval or a replacement for the root decision register. The eight retained catalog records are candidate estimates with explicit evidence gates; `eligible_for_live` is false until exact evidence and scope approval are recorded. Retaining numbers for review does not authorize displaying them as evaluated outcomes.

## Proposed four-crop scope

Propose summer `maize` and `soybean`, winter `wheat` and `faba_bean`. These give two choices in each season, cereal/legume variety, and avoid making rice permission a prerequisite for the demo. Keep `rice`, `cotton`, `berseem`, and `sugar_beet` as additional candidates, excluded from the proposed initial scope. The Lead must approve this scope after Research checks the exact local calendar and water evidence.

| Crop | Available source lead | Current evidence limit |
|---|---|---|
| Maize | FAO Chapter 3, Table 14; cached Egypt Delta calendar | Generic indicative ET range is not a Zankalon measurement; exact local calendar row and stage Kc citations pending. |
| Soybean | FAO Chapter 3, Table 14; cached Egypt Delta calendar | Generic crop estimate requires local applicability check; exact calendar and stage Kc citations pending. |
| Wheat | FAO Chapter 3, Table 14; Sugita study | Study metadata corrected; field/cultivar/table matching and calendar citations pending. |
| Faba bean | FAO Chapter 3, Table 14 generic “Bean”; cached Egypt Delta calendar | Generic bean is not species-specific evidence for faba bean. Catalog 350–500 differs from generic 300–500; retain as pending rather than silently substitute. |

Primary source: [FAO Crop Water Needs, Chapter 3](https://www.fao.org/4/s2022e/s2022e07.htm), Table 14. It defines crop water need as evapotranspiration under optimal conditions. It does not establish field irrigation delivery, puddling/percolation, or guaranteed savings. Local calendar lead: `data/raw/fao_crop_calendar_EG_delta.json`; record the exact crop/zone row and demonstrate applicability before approval.

## Structural examples for checking

In canonical slot order, the following proposed sequences are distinct and match the existing summer/winter labels:

- Baseline: `maize, faba_bean, maize, wheat`.
- Alternative A: `soybean, faba_bean, maize, wheat`.
- Alternative B: `maize, faba_bean, soybean, wheat`.

Under the proposed whole-month calendar, the first summer ends September, first winter faba bean ends April, second summer ends September, and final wheat begins November. Thus these examples avoid the May overlap that would occur if wheat were followed immediately by a May-start summer crop. Calendar compatibility alone does not prove agronomic suitability: family succession (including soybean/faba bean), pests, cultivar duration and local planting dates still require Research/Crop review. These are review inputs, not approved recommendations or rankings. No promise of two valid alternatives is made before that review.

## Evidence gates and extra candidates

- Rice: retain 900–1400 mm as a disputed estimate. Table 14 generic rice ET is 450–700 mm; record an actual local source and derivation for any different interval. Keep ET, puddling, percolation and irrigation delivery separate. Permission is unknown until an applicable MWRI decree and farm/canal-command location are matched; the ministry homepage is insufficient.
- Berseem: retain 550–800 mm as pending. Identify a full multi-cut growing-period measurement or derivation and its unit, location, management, cultivar and page/table. Generic clover or legume descriptions do not validate this range.
- Sugar beet: retain 500–700 mm as pending; Table 14's generic 550–750 mm does not establish this interval.
- Cotton: retain as candidate; exact grow-window and water/stage coefficient citations are still required. The October-ending window also requires checking overlap with winter planting.
- Every crop's Kc stages, crop-specific temperature threshold and exact growing dates remain pending exact primary citations. Crop-specific threshold estimates must not silently replace the common public exposure threshold in `docs/METHOD.md`.

The numerical estimates have been preserved in the candidate files for review. A live adapter must gate candidate eligibility and return `null` / Not evaluated or unavailable responses as appropriate; structural validation cannot supply Research sign-off. No new field in these candidate files overrides `START_HERE.md` or authorizes a shared API change.
