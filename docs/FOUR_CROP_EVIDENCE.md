# Four-crop evidence proposal for PR #1

**Research follow-up:** 2026-11-13. Addresses review item 2. This is an explicit proposal to Lead, Crop and Research, not an approval or an instruction to publish live outcomes. Existing eight-crop candidate values are retained elsewhere unchanged. Machine-readable proposal: `data/processed/four_crop_proposal.json` when present.

## Proposed scope and selected parameters

| Crop | Proposed indicative `water_need_mm` | Evidence locator and applicability | Proposed API month envelope |
|---|---|---|---|
| maize | 500–800 | [FAO Chapter 3](https://www.fao.org/4/s2022e/s2022e07.htm), §3.3.4 Table 14, maize row; generic crop ET estimate, not local measurements | May–September |
| soybean | 450–700 | Same table, soybean row; generic estimate | May–September |
| wheat | 450–650 | Same table, barley/oats/wheat row; generic estimate | November–April, crossing year |
| faba_bean | `min:null,max:null` | Submitted 350–500 has no exact derivation; generic bean cannot silently stand in for Vicia faba | October–April, crossing year |

FAO's rough ranges depend on climate and duration. The proposal uses them only as indicative growing-period ET under stated assumptions. The three sourced rows do not establish optimal performance on the Zankalon farm. Any plan containing faba bean has a null water total until its comparable water evidence is approved. Keep the observed experimental span below separate from the proposed water metric.

## Maize and wheat calendar evidence

Source `SRC-GYGA-EGYPT-CALENDAR`: [Global Yield Gap Atlas, Egypt, Table 1, Nile delta rows](https://yieldgap-test.containers.wur.nl/egypt), accessed 2026-11-13; hosted by Wageningen University. Maize sowing: 15 April–15 May, maturity 100 days after sowing for early varieties or 110–130 for medium/late varieties. Wheat sowing: 10–30 November; physiological maturity: 15 April–10 May.

These regional bounds support selecting May sowing for maize and late-April physiological maturity for wheat. Example selections: maize 15 May to 22 September (130 elapsed days after sowing, **131 inclusive calendar dates**); wheat 15 November to 30 April (167 inclusive dates, 168 if leap February occurs). They are selected model dates within regional bounds, not observations from the demo farm. Wheat grain drying/field clearance after physiological maturity is not established by the source, so immediate next-crop feasibility requires agronomic review.

## Soybean and faba calendar evidence

Primary source `SRC-FAO-CALENDAR-EG-DELTA`: [FAO Egypt Delta AEZ001 endpoint](https://api-cropcalendar.apps.fao.org/api/v1/countries/EG/cropCalendar?language=en&aez=001). The endpoint could not be refreshed via web tool on 2026-11-13; evidence here is the retained response `data/raw/fao_crop_calendar_EG_delta.json`, SHA256 `69d8c6815389133eea1587bf79ada8edfbf1b08296c664bce1ae7c4e49d3f303`. Do not claim this is a freshly retrieved response.

| Crop selector | Exact retained fields | Selected model dates and treatment |
|---|---|---|
| `crop.id=0327`, `sessions[0]` (Soybean) | `early_sowing` May 1; `later_sowing` May 25; `early_harvest` Sep 1; `late_harvest` Oct 20; `growing_period.value=95 - 120` days | May 15–Sep 11 =120 inclusive dates; envelope May–Sep |
| `crop.id=0028`, `sessions[0]` (Bean, broad) | sowing Oct 1–Nov 15; harvest Apr 15–May 1; growing period180–190 days | Oct 15–Apr 15 =183 inclusive dates,184 with leap February; envelope Oct–Apr |

The broad-bean record is different from green broad bean `0027`; the latter's sessions must not be substituted. Chosen dates stay within each record's bounds and stated duration. These are crop-specific regional calendar records, not measured cultivar responses at Zankalon.

## Faba water evidence found and why it does not validate 350–500

Source `SRC-ARC-FABA-EID-2008`: Eid, S.M., Abdallah, M.A.A., El-Araby, A.A., and El-Saady, S.A. (2008), *Effect of irrigations number and phosphorus fertilization on yield and its components of faba bean in North Nile Delta*, Journal of Agricultural Sciences, Mansoura University33(12):9121–9128. [Primary publisher PDF](https://jssae.journals.ekb.eg/article_200464_1ee00d51e561f586f380a8974ec26657.pdf), accessed 2026-11-13.

Exact locator: **p.9124, Table2, final Mean column**, irrigation treatments I3/I4/I5:30.0,34.8,42.0cm seasonal consumptive use. Multiplying depth in cm by10 yields300,348,420mm. The across-treatment mean span is300–420mm, not350–500. **p.9122, Materials and Methods**: Sakha clay-soil experiments, seasons2005/06 and2006/07, with varying irrigation number and phosphorus. It is empirical evidence at a different Delta site and management regime. This treatment span cannot be passed off as a standard optimal requirement envelope, statistical uncertainty interval or delivered irrigation amount. Table1 separately accounts for applied water. Retain `water_need_mm=null` while Research establishes a comparable metric and Zankalon applicability.

## Explicit approval proposal

Before/after proposal: keep all eight original catalog records as candidates; separately propose summer maize/soybean and winter wheat/faba bean with the four envelopes above, three FAO indicative ranges and faba null. Do not silently mutate `crop_catalog.json` or call the proposal approved. Record final scope in `START_HERE.md` only through Lead/consumer approval, plus Research approval of scientific meaning.

Whole-month heat windows are an explicit **calendar aggregation convention**: May1–Sep30, Nov1–Apr30, or Oct1–Apr30. These envelopes deliberately include dates outside the example planted crop windows. They are suitable only for a disclosed approximate exposure comparison. They do not claim the exact crop durations or flowering-stage injury. They remove month-level overlaps between adjacent proposed slots, but seasonal compatibility, field clearance and variety choice still need sign-off. Exact-day modeling would require the approved contract to represent exact dates rather than descriptions.

The proposed four crops can create distinct candidate sequences; rotation validity and numeric reproduction are checked separately in the shortlist/checker handoff. Source review does not automatically approve rank order, ETc stage coefficients, biological heat thresholds, regulatory permissions or live results.
