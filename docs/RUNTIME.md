# Run the local prototype

These are Technical Lead defaults, effective immediately. No additional team meeting is required. Owners implement the existing APIs using their chosen languages and frameworks. Internal implementation can change without consumer approval; changing shared API fields or scientific meaning still follows `START_HERE.md`.

## Start development today

Python 3.10 or newer runs the HTTP fixture tools without packages. The [local research importer](database/local-import.md) uses the pinned dependencies in `requirements-mongo.txt`. An installed native MongoDB Community 8.0 server runs persistence. Python is a tooling choice, not a required backend language.

```sh
cp .env.example .env
python3 tools/dev.py fixtures
```

This starts all three independent fixture servers. Stop them with Ctrl+C. No MongoDB or NASA connection is needed. Every response has `X-AgriLens-Data-Mode: fixture` and `Cache-Control: no-store`. Region names and response metadata label synthetic data. Never use the fixture command as a live deployment or outage fallback.

In another terminal:

```sh
curl http://127.0.0.1:8000/api/config
curl -X POST http://127.0.0.1:8000/api/compare \
  -H 'Content-Type: application/json' \
  -d '{"region_id":"sample_region","baseline":["summer_a","winter_a","summer_a","winter_a"],"priority":"water","scenario":"average"}'
```

For failure/partial-data work, stop the fixture processes occupying that service's port, then run one selected profile:

```sh
python3 tools/dev.py fixtures comparison --profile one_plan
python3 tools/dev.py fixtures climate --profile missing_day
python3 tools/dev.py fixtures crops --profile outage
```

Each command runs until stopped; run them in separate terminals when combining services. See [the fixture catalog](../fixtures/README.md) for profiles and exact requests. The fixture services replay recorded cases; they do not call each other, rank arbitrary rotations, or demonstrate a real outage propagating through Comparison. A profile on Climate affects only the Climate fixture response. Select a Comparison failure profile to develop that UI state.

## Service addresses and entrypoints

| Service | Base URL on the host | Required endpoints | Owner's command file |
|---|---|---|---|
| Comparison | `http://127.0.0.1:8000` | `/health`, `/api/config`, `/api/compare` | `services/comparison/start.json` |
| Climate | `http://127.0.0.1:8001` | `/health`, `/internal/climate?region_id=...` | `services/climate/start.json` |
| Crop | `http://127.0.0.1:8002` | `/health`, `/internal/crops?region_id=...` | `services/crops/start.json` |

Each owner adds `start.json` with a command array. The launcher executes it directly, without shell interpolation, from the service directory. Install that service's dependencies using its own README.

Node.js example:

```json
{"command": ["npm", "run", "dev"]}
```

ASP.NET Core example:

```json
{"command": ["dotnet", "run", "--no-launch-profile"]}
```

Node services read `HOST` and `PORT`. The launcher also sets `ASPNETCORE_URLS` to the selected address for .NET services. `--no-launch-profile` prevents launchSettings.json from overriding that address; application code must not hardcode another URL. These are examples, not required frameworks.

Once an owner adds their command file, replace that fixture process with:

```sh
python3 tools/dev.py run climate
python3 tools/dev.py run crops
python3 tools/dev.py run comparison
```

Run each in its own terminal. Missing command files fail explicitly; the launcher never substitutes fixture data automatically. Real services must reject `DATA_MODE=fixture` unless they explicitly implement an isolated fixture mode. Their default is `live`; missing approved dataset selections produce an unavailable state rather than invented data.

## Run and verify the integrated internal services

Install Node.js 22 or newer and each service's pinned dependencies:

```sh
npm ci --prefix services/climate
npm ci --prefix services/crops
```

With MongoDB running, start each service in its own terminal from the repository root:

```sh
python3 tools/dev.py run climate
python3 tools/dev.py run crops
```

Pin approved revisions with `CLIMATE_DATASET_ID` and `CROP_CATALOG_ID`.
The checked-in research package remains staging, so requests for its region
return HTTP 422 `INSUFFICIENT_DATA` and readiness returns HTTP 503.
Missing selections and storage outages never trigger a fixture fallback.
For example, with the staging revisions selected:

```sh
curl -i 'http://127.0.0.1:8001/internal/climate?region_id=zankalon_sharkia'
curl -i 'http://127.0.0.1:8002/internal/crops?region_id=zankalon_sharkia'
```

Both bodies contain `{"error":{"code":"INSUFFICIENT_DATA","message":"..."}}`.
Use the explicit fixture launcher for successful development responses while
Research reviews the data.

Run these checks after installing `requirements-mongo.txt` into your Python environment:

```sh
npm test --prefix services/climate
npm test --prefix services/crops
npm run test:mongodb --prefix services/crops
python -m unittest discover -s scripts -p 'test_*.py'
python3 tools/verify_fixtures.py
python3 tools/verify_runtime.py
```

The MongoDB tests require Community 8.0. They use randomly named databases ending
in `_fixtures` and delete those databases afterward. `scripts/test_backend_services.py`
imports the research package using the existing Python importer, starts both
Node services through `tools/dev.py`, and checks HTTP approval gates, error codes,
response projection, health, and shutdown. Its invented approval records and
synthetic crop records exist only in disposable test databases.

These checks verify the internal services and development tools. The repository
has no Comparison service implementation yet, so they do not prove the public
comparison journey. Research must approve the region, final crop catalog, and
scientific methods before the Lead selects live revisions and connects Comparison
through the internal HTTP APIs.

## Configuration and timeouts

The launcher reads `.env.example`, overrides it with optional `.env`, then applies process environment variables. Values are literal `KEY=value` strings, not shell code. Quoting, interpolation and `export` prefixes are not supported. It sets each service's `PORT` from its named port setting. `.env` is ignored by Git.

| Variables | Default and behavior |
|---|---|
| `HOST` | `127.0.0.1` |
| `COMPARISON_PORT`, `CLIMATE_PORT`, `CROP_PORT` | `8000`, `8001`, `8002` |
| `COMPARISON_BASE_URL`, `CLIMATE_BASE_URL`, `CROP_BASE_URL` | Corresponding host URLs above; update both URL and port when overriding a port |
| `APP_ORIGIN` | `http://localhost:5173`; frontend origin allowed by Comparison CORS |
| `HTTP_CONNECT_TIMEOUT_MS` | `1000` for internal HTTP connection establishment |
| `HTTP_READ_TIMEOUT_MS` | `3000` for receiving internal service data |
| `HTTP_TOTAL_TIMEOUT_MS` | `5000` total Comparison request deadline, including dependency calls; clients must enforce total time even if a peer keeps streaming |
| `HTTP_RETRIES` | `0`; return a retryable error and let the user retry |
| `MONGODB_PORT`, `MONGOD_BIN` | `27017`, `mongod`; the executable can be an absolute path |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017`, no username or password |
| `CROP_DB_NAME`, `CLIMATE_DB_NAME` | `agrilens_crops`, `agrilens_climate` |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `2000` |
| `DATA_MODE` | `live`; fixture launcher explicitly overrides to `fixture` |
| `CROP_CATALOG_ID`, `CLIMATE_DATASET_ID`, `RELEASE_ID` | Empty until verified data is available; never infer the newest dataset |

App's HTTP deadline is 8000 ms so Comparison can return its own useful error first. Connection failures, timeouts, unavailable storage or malformed dependency responses map to `SERVICE_UNAVAILABLE` with HTTP 503. A known region with missing evidence maps to `INSUFFICIENT_DATA` with HTTP 422.

Status defaults are HTTP 400 for `INVALID_INPUT`, 404 for `UNKNOWN_REGION`, 422 for `UNSUPPORTED_SCENARIO`, `INSUFFICIENT_DATA` and `NO_VALID_ROTATION`, and 503 for `SERVICE_UNAVAILABLE`. Preserve the root error body. `/health` returns HTTP 200 with `{ "status": "ok" }` when ready, or HTTP 503 with the standard error body when unavailable. Optional diagnostic health fields must not contain credentials.

The App only calls Comparison. Comparison calls the two internal services. Comparison permits `APP_ORIGIN`, handles OPTIONS, and allows `Content-Type` for JSON POST requests. The fixture server additionally permits `http://127.0.0.1:5173`. Owners implement timeout and CORS behavior in their chosen framework; documenting these variables does not make future services enforce them automatically.

## Start native MongoDB

Install MongoDB Community 8.0 using the package or native binary appropriate for your operating system. Only `mongod` is needed to run the server. No container runtime or background service manager is required. The import commands use the separately installed Python tooling dependencies. If MongoDB already runs on port 27017, use that instance instead of starting another.

```sh
python3 tools/dev.py mongo
```

The launcher starts one foreground `mongod` process on `127.0.0.1:27017`, without authentication. Data stays in ignored `.local/mongo/`. Ctrl+C stops the process and retains data. WiredTiger's internal cache is limited to 0.25 GiB; total process memory can be higher. Set `MONGOD_BIN` if the executable is outside PATH. If the port changes, update `MONGODB_URI` as well.

Both backend services can read/write all local databases. Collection ownership is a code convention, not a permission boundary. Comparison uses internal APIs rather than querying their collections. HTTP fixture servers never use MongoDB; storage tests use database names ending in `_fixtures`.

Follow [the local import guide](database/local-import.md) to install the small tooling environment, run `python tools/dev.py import-data`, and read back the stored records with `python tools/dev.py verify-data`. Each developer imports the same Git-tracked data into their own local databases. Matching imports are repeatable and partial staging imports can resume. Scientific status remains unapproved.

MongoDB creates databases and collections on first write. The Crop importer uses `agrilens_crops.crop_catalogs`; Climate uses `agrilens_climate.climate_datasets` and `climate_daily`. The Climate owner creates the unique `{dataset_id: 1, date: 1}` index through the chosen driver before importing daily records. No synthetic measurements are seeded into these databases.

All addresses assume service processes run on the host. A reverse proxy can unify URLs later; it does not replace startup commands, configuration, timeouts, or scientific methods.

References: [MongoDB Community installation](https://www.mongodb.com/docs/manual/installation/), [native mongod options](https://www.mongodb.com/docs/v8.0/reference/program/mongod/), [ASP.NET Core hosting URLs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/web-host).

## Verify and hand off

```sh
python3 tools/generate_fixtures.py
python3 tools/verify_fixtures.py
python3 tools/verify_runtime.py
git diff -- fixtures
```

Generation is deterministic. Verification exercises every fixture case over real HTTP, independently checks synthetic water/heat calculations, season validity, source references, missing values and scenario selection, and checks the priority/scenario matrix. It proves fixture consistency, not real scientific accuracy or future service correctness.

Research owns `docs/SOURCES.md` and `docs/METHOD.md`, including source IDs/titles, approved facts, calendar/scenario/heat definitions, worked examples and limitations. The Lead implements selection/ranking and integration using those methods. Service developers implement importers, adapters, startup and errors. Research's final audit still needs actual service outputs, App screens and presentation material.
