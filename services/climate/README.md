# Climate service

Run this service through the project launcher from the repository root:

```sh
npm ci --prefix services/climate
python3 tools/dev.py run climate
```

The launcher reads `.env.example` and the optional local `.env`, then starts the service on the configured Climate port. The service uses the existing Express and MongoDB driver dependencies.

Endpoints:

- `GET /health`
- `GET /internal/climate?region_id=<region id>`

The local data importer reads the checked-in package under `data/processed/mongodb` and writes to `agrilens_climate.climate_datasets` and `agrilens_climate.climate_daily`. The service reads only `CLIMATE_DATASET_ID`; it never chooses the newest revision. It projects storage documents into the shared internal API response and keeps MongoDB fields private.

The imported dataset is currently a staging candidate and is not scientifically approved. The service rejects staging, sealed, rejected, fixture, or unsupported-schema records. Keep `CLIMATE_DATASET_ID` empty until Research approval and a release selection are recorded. An empty ID returns the standard unavailable response.

`DATA_MODE=fixture` is handled by the separate project fixture server. The live service refuses to start in fixture mode so fixture values cannot be mistaken for live climate evidence.

Run `npm test --prefix services/climate` from the repository root for validation and HTTP contract checks.

## Retained-data prototype

[The backend runbook](../../docs/BACKEND.md) provides a pinned unreviewed release using
the retained 3,653 daily records. `DATA_MODE=unreviewed` accepts a sealed observed
snapshot with null approval; all date, completeness, sentinel and metadata checks
still apply. Default live mode retains its approval requirements. Responses identify
the selected mode in `X-AgriLens-Data-Mode`.
