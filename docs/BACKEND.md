# Run the backend prototype

The backend prototype is finished for local use with retained, unreviewed research
inputs. It uses native MongoDB and the three independently runnable services.
It does not require a synthetic HTTP server. Scientific review was waived by the
project owner; release records and responses remain explicitly unreviewed.
App integration and public hosting are outside this completion status.

## Prepare the runtime

Run from the repository root. Use Node.js 22 or newer, Python 3.10 or newer, and
MongoDB Community 8.0. See [RUNTIME.md](RUNTIME.md) for native MongoDB installation
and `MONGOD_BIN` configuration.

```sh
python3 -m venv .local/mongo-venv
.local/mongo-venv/bin/python -m pip install -r requirements-mongo.txt
npm ci --prefix services/crops
npm ci --prefix services/climate
```

If MongoDB is not already running, keep this command open in another terminal:

```sh
python3 tools/dev.py mongo
```

The Comparison service has no third-party Node dependencies. The default local
MongoDB address is `127.0.0.1:27017`, without authentication. The release tooling
accepts only a single loopback MongoDB address and separate non-system databases.
Never stop an unrelated MongoDB process to run the tests.

## Build, import and start the pinned release

```sh
.local/mongo-venv/bin/python scripts/prototype_release.py build --pin
.local/mongo-venv/bin/python scripts/prototype_release.py import
.local/mongo-venv/bin/python tools/backend.py run
```

`build` checks the original research package, selects the four-crop proposal, and
creates `.local/backend/release.json`. It archives old and new release bundles under
`.local/backend/releases/`. `--pin` records the manifest in `releases/prototype.json`.
Input and runtime hashes determine the release ID. Changed code or inputs require a
new release. After a deliberate rebuild, version-control the updated manifest.

`import` creates new snapshot IDs without changing the original staging records.
Crop is inserted atomically. Climate stays staging until every daily row matches;
only then is it sealed. Interrupted imports can resume. Matching retries do not
rewrite data, and conflicting or already sealed snapshots cannot be overwritten.
Approval remains null throughout. The command uses the existing MongoDB validators
and unique dataset/date index.

`run` verifies stored contents and runtime hashes before starting the three service
command files. It selects `DATA_MODE=unreviewed`, both exact snapshot IDs, and the
release baseline. It checks readiness and exercises the real API before reporting
success. Ctrl+C or SIGTERM stops only the three processes it started. Port conflicts
fail explicitly. Logs are under `.local/backend/logs/`.

The public API is `http://127.0.0.1:8000`. The private service ports are 8001 and 8002.
To check the stack and exit instead of keeping it running:

```sh
.local/mongo-venv/bin/python tools/backend.py check
```

Stop the running stack first or select three unused ports in the environment.
The same command cannot start a second stack on occupied ports.

## Try the real public API

```sh
curl http://127.0.0.1:8000/api/config
curl -X POST http://127.0.0.1:8000/api/compare \
  -H 'Content-Type: application/json' \
  -d '{"region_id":"zankalon_sharkia","baseline":["maize","wheat","maize","wheat"],"priority":"water","scenario":"average"}'
```

The sample returns three distinct, season-compatible, nonoverlapping plans with the
baseline unchanged. Its indicative water range is 1900–2900 mm across four growing
periods. Its mean whole-window exposure is 279.125 crop-days at Tmax >=35°C, using
complete anchors 2016–2023. The acceptance check independently reproduces these
values from crop endpoints and the retained raw NASA temperatures.
These are prototype calculations over declared assumptions, not measured irrigation
savings, crop damage, forecasts or scientific acceptance evidence.

Only `average` is offered. The hottest 2024 and driest 2025 anchors lack the final
winter coverage and return `INSUFFICIENT_DATA`. Any plan containing faba bean has
`water_need_mm: {"min": null, "max": null}`. The response explains missing metrics.

## Back up and restore

Create a backup only after MongoDB readback succeeds:

```sh
.local/mongo-venv/bin/python scripts/prototype_release.py backup \
  --output .local/backend/backups/verified.json
```

The backup includes the exact selected snapshots, all daily rows, original NASA
artifact, input research files, source ledger, method, root decisions and runtime
source files. Checksums are verified before writing and again before restore.
This is a portable JSON snapshot of the selected release, not a whole-server dump.
Keep it outside this machine for protection against disk loss.

Restore into fresh databases and verify them without changing the current selection:

```sh
CROP_DB_NAME=agrilens_crops_restored CLIMATE_DB_NAME=agrilens_climate_restored \
  .local/mongo-venv/bin/python scripts/prototype_release.py restore \
  --bundle .local/backend/backups/verified.json
CROP_DB_NAME=agrilens_crops_restored CLIMATE_DB_NAME=agrilens_climate_restored \
  .local/mongo-venv/bin/python scripts/prototype_release.py verify \
  --bundle .local/backend/backups/verified.json
CROP_DB_NAME=agrilens_crops_restored CLIMATE_DB_NAME=agrilens_climate_restored \
  .local/mongo-venv/bin/python tools/backend.py check \
  --bundle .local/backend/backups/verified.json
```

## Roll back a release

Stop the current stack. Choose the archived bundle for the previous verified release:

```sh
.local/mongo-venv/bin/python scripts/prototype_release.py restore --bundle /path/to/previous.json
.local/mongo-venv/bin/python tools/backend.py run --bundle /path/to/previous.json
```

The runner pins both snapshots and the baseline together. A failed dependency never
silently switches revisions. If runtime hashes differ, check out the matching release
commit before running it. Archived runtime files support inspection and recovery;
restoring a data bundle does not overwrite application code. The acceptance test
verifies switching between two releases and back to the exact earlier result.

## Verify completion

```sh
npm test --prefix services/crops
npm test --prefix services/climate
npm test --prefix services/comparison
npm run test:mongodb --prefix services/crops
.local/mongo-venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
python3 tools/verify_fixtures.py
python3 tools/verify_runtime.py
```

`scripts/test_prototype_backend.py` starts its own MongoDB process on a private port
with a temporary data directory. It launches all three real services, checks all
16 supported baselines and all priorities, independently checks each selected plan's
water and heat, and verifies incomplete scenarios and invalid inputs. It stops and
restarts Climate, then its own MongoDB instance, proving errors and recovery without
fixture fallback. It restores a backup into fresh databases, checks HTTP results,
switches releases and rolls back, rejects checksum corruption and conflicting sealed
snapshots, and resumes a simulated partial import. It stops its own processes and
removes its temporary data. It does not interrupt the user's MongoDB server.

Default `DATA_MODE=live` continues to require approved snapshots. `unreviewed` accepts
only sealed observed snapshots without approval records; staging, rejected, fixture
and unsupported-schema snapshots stay unavailable. Source references, units,
coordinates, calendars, null handling, missing dates and NASA sentinels remain checked.
Every service emits `X-AgriLens-Data-Mode: unreviewed`, and public configuration and
comparison warnings disclose the prototype status.
