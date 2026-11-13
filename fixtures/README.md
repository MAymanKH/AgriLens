# Synthetic API fixtures

Every number, coordinate, crop, family and climate record here is artificial. None is NASA data or an agricultural recommendation. No Research approval is implied.

`cases.json` is the HTTP case catalog. Each case contains service, profile, request method/path/body, expected HTTP status and response filename. JSON response files contain the complete contracted body without a test-only wrapper. Use the corresponding request verbatim; the server does not implement arbitrary crop comparison.

The default baseline is `summer_a, winter_a, summer_a, winter_a`. Four fixture crops support three distinct rotations. Synthetic water ranges deliberately differ. Identical season windows make all heat metrics tie. Priority variants document that tie rather than fabricate a production scoring method.

Climate includes every date in 2020–2024, including leap days. Synthetic annual temperatures and precipitation select 2021 as hottest and 2022 as driest. Fixture-only heat rules use strict temperature above 35 C, summers June–August and winters December–February. Two-year anchors require following-winter coverage; the synthetic average uses 2020, 2021 and 2022. These rules are test inputs, not approved methods for Egypt.

| Service | Profiles |
|---|---|
| Comparison | `normal`, `one_plan`, `two_plans`, `missing_metrics`, `unsupported_scenario`, `incomplete_scenario`, `insufficient_data`, `outage` |
| Climate | `normal`, `missing_day`, `insufficient_data`, `outage` |
| Crop | `normal`, `missing_water`, `insufficient_data`, `outage` |

`normal` includes the 9 priority/scenario successes, unknown region/crop, wrong season/slot count, invalid priority/scenario, internal missing-region errors and health checks. Profile cases override matching normal requests; unmatched profile requests use the normal cases. Outage is deterministic and retrying succeeds only after restarting with a healthy profile. Malformed JSON produces `INVALID_INPUT` over HTTP. All errors preserve the root error envelope.

The `missing_day` climate profile removes 2021-07-01, records one missing day and makes its hottest-year selection unavailable. `missing_water` keeps season validity but returns null water for one crop. Comparison partial-data profiles are independent UI examples, not automatically derived from whichever internal profile is running.

Run and regenerate using [the local runtime guide](../docs/RUNTIME.md). Generation is maintained in `tools/generate_fixtures.py`; edit the generator and regenerate rather than hand-editing response copies.
