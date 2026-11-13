# Prepare the candidate research import

The Zankalon files are candidate evidence from [PR #1](https://github.com/MAymanKH/AgriLens/pull/1). Scientific approval remains Pending in `START_HERE.md`. This procedure creates local files. It does not write to MongoDB, publish a dataset, or approve a claim.

To load these files into each developer's own database, use [the local import guide](local-import.md). Importing preserves their unapproved status.

From the repository root, rebuild the files using the retained NASA response:

```sh
python scripts/build_research_data.py
python scripts/validate_research_data.py
python scripts/test_research_import.py
```

The builder treats `data/processed/crop_catalog.json`, `data/processed/region_config.json`, and `docs/SOURCES.md` as curated Research inputs. It preserves crop values and calculation methods. It corrects time-standard metadata from the raw NASA header. Review the report warnings for discrepancies that require Research action.

The default decision revision is the exact commit already pinned in the generated manifest. For a revised Research handoff, commit its source ledger, method, and decisions first. Then regenerate with that exact commit:

```sh
python scripts/build_research_data.py --decision-revision FULL_40_CHARACTER_COMMIT
```

For newly downloaded NASA evidence, pass its actual UTC retrieval timestamp with `--retrieved-at`. An offline rebuild preserves the recorded retrieval time. `fetch_and_process_zankalon.py` downloads only the raw response and prints the rebuild command. The obsolete Kafr fetch script has been removed so it cannot overwrite the Zankalon outputs.

The builder produces these files:

| File | Consumer |
|---|---|
| `data/processed/climate_daily_clean.json` | Climate owner, complete normalized series |
| `data/processed/region_config.json` | Lead, candidate configuration with corrected time standard |
| `data/fixtures/mock_climate_response.json` | Climate owner, complete source-backed development response |
| `data/fixtures/mock_crop_catalog.json` | Crop owner, contracted fields and resolved source IDs |
| `data/processed/mongodb/crop_catalog_document.json` | Crop owner, staging catalog with source titles |
| `data/processed/mongodb/climate_dataset_document.json` | Climate owner, staging manifest with raw checksum and validation references |
| `data/processed/mongodb/climate_daily.jsonl` | Climate owner, one document per day with `schema_version` and `dataset_id` |
| `data/processed/mongodb/validation_report.json` | Both owners, integrity results and unresolved publication warnings |

`--check` regenerates in memory and compares every output byte without writing. Both legacy validation commands use this check. They cannot mark a dataset approved. A passing integrity check does not prove that scientific facts or the public API are approved.

The raw checksum covers the original response bytes. The normalized checksum covers the climate metadata, sorted daily rows, parameter mapping, and committed method reference. Serialization is UTF-8 JSON with sorted keys, compact separators, `ensure_ascii=False`, and `allow_nan=False`. Regression tests independently reconstruct the checksum input.

All generated manifests have `status: staging` and `approval: null`. The eight crops remain candidates. Source titles come from the candidate ledger and still need Research citation review. These responses are source-backed development examples, not synthetic measurements and not live-service approval. The independent synthetic HTTP cases remain under `fixtures/`.

After Research resolves the review and the Lead records the approved 4–6 crop selection, service owners implement the controlled import lifecycle in [the implementation handoff](implementation-handoff.md). They assign new immutable IDs, record actual import timestamps, decode Extended JSON dates as BSON dates, install the required unique dataset/date index, and validate before sealing and approving. Do not import the whole climate response as one daily document or select these staging IDs in a live release.
