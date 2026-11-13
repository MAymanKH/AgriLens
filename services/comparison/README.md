# Comparison service

The Technical Lead's public API runs on Node.js 22 or newer with no package dependencies.
It computes results from the Crop and Climate HTTP APIs. It does not read their source
code, research files, or databases, and it never falls back to stored fixture responses.

## Run against development data

Run these commands from the repository root in three separate terminals:

```sh
python3 tools/dev.py fixtures crops
```

```sh
python3 tools/dev.py fixtures climate
```

```sh
DATA_MODE=fixture python3 tools/dev.py run comparison
```

The third command starts the real Comparison engine. Only the internal data is synthetic.
All responses carry `X-AgriLens-Data-Mode: fixture`; the configuration and comparison
warnings identify the data as synthetic. Do not run the Comparison fixture server on
the same port.

```sh
curl http://127.0.0.1:8000/api/config
curl -X POST http://127.0.0.1:8000/api/compare \
  -H 'Content-Type: application/json' \
  -d '{"region_id":"sample_region","baseline":["summer_a","winter_a","summer_a","winter_a"],"priority":"water","scenario":"average"}'
```

The response preserves the baseline, whose water range is 360–640 mm. The first
water alternative is `summer_b,winter_b,summer_b,winter_b`, with 220–340 mm.
These are synthetic arithmetic examples, not measured water requirements or savings.
`/health` checks dependency responses and the availability of a complete average scenario.

## Run against the internal services

Start Crop and Climate as described in [the runtime guide](../../docs/RUNTIME.md), then run:

```sh
python3 tools/dev.py run comparison
```

The default mode is `live`, using region `zankalon_sharkia`. Comparison accepts successful
internal API responses without a separate scientific approval lookup. It propagates
unavailable datasets and storage failures from the internal services. Those services
currently reject staging datasets; this implementation does not alter their release rules.
Do not change their stored approval metadata to make a successful response.

The launcher supplies configuration from `.env.example`, optional `.env`, then the
process environment. Direct `npm start --prefix services/comparison` uses the same
precedence. `COMPARISON_REGION_ID` and `COMPARISON_REGION_NAME` can select a region
without changing the public contract. Override the name along with the ID.
The configured internal services must both serve that region.

The service honors `HOST`, `PORT`, `COMPARISON_PORT`, `CLIMATE_BASE_URL`,
`CROP_BASE_URL`, `APP_ORIGIN`, and the three `HTTP_*_TIMEOUT_MS` settings.
It makes concurrent dependency requests with connection, inactivity, and absolute
deadlines. It does not retry. A failed request returns the standard error shape.
`Cache-Control: no-store` prevents silent reuse of previous results.

## Calculation and selection

The implementation uses the prototype convention in [METHOD.md](../../docs/METHOD.md).
The user's 2026-11-13 instruction waived approval workflow for this implementation;
it does not establish scientific validation of the inputs.

- Validate four slots and preserve the baseline exactly. Enumerate all combinations
  of the supplied catalog, limited to six crops. Exclude rotations with missing source
  IDs, missing months, or overlapping windows. An invalid baseline is rejected.
- Sum lower and upper water endpoints separately. If any component is incomplete,
  return both aggregate endpoints as `null`. Historical scenarios do not alter water.
- Count Tmax >=35°C over inclusive whole-month windows. Slot-start years are
  `n,n,n+1,n+1`. A window whose end month precedes its start month ends the next year.
- For average exposure, use the same complete anchors across all valid rotations.
  Average the per-anchor counts, preserving fractions. Missing observations are never zero.
- Independently recompute hottest and driest years from complete calendar years,
  selecting the earliest tied year. Check the internal scenario declarations against
  those results. Require complete four-slot coverage after selecting the year.
- Advertise only scenarios that can evaluate every offered rotation. The retained
  2016–2025 data cannot cover the final winter of the 2024 or 2025 selected scenarios.
- Keep the baseline first. Choose the first distinct alternative by the requested
  priority. Choose the second from remaining rotations by descriptive diversity.
  Return fewer alternatives with a warning when necessary.

Water priority sorts by range midpoint, heat, family count, and distinct crop count.
Heat priority sorts by exposure, water midpoint, family count, and distinct crop count.
Soil priority sorts by family count, distinct crop count, water midpoint, and heat.
Final ties use lexicographic crop-ID sequences. Unknown ranking metrics follow known
values. A legume flag appears only as a descriptive slot count. No soil outcome is predicted.
Stable plan IDs are identifiers; `water_conscious` can hold an alternative selected
for heat or diversity. They do not claim an improvement for every baseline.

## Verify

```sh
npm test --prefix services/comparison
```

The tests independently reproduce synthetic water and heat values, check the retained
research proposal against raw NASA temperatures, exercise the priority/scenario matrix,
and verify missing data, leap days, overlaps, distinct alternatives, malformed inputs,
CORS, provenance references, unavailable dependencies, and deadlines under a trickling response.
The process integration test launches separate Python Crop/Climate fixture servers and
runs the real Comparison service through `tools/dev.py`. It stops a dependency to prove
that successful results do not become an outage fallback. Tests use ephemeral ports
and stop their own processes. No MongoDB or third-party Node packages are required.

Next handoff: App can use the public API now with the synthetic internal services.
Real deployment still requires data the internal services can serve, the three-screen
app integration, and an end-to-end check of that deployment. Scientific limitations
remain in response metadata; these tests do not validate agricultural claims.
