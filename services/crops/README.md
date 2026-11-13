# Crop & Agriculture service

Your Node.js / Express / Mongoose implementation lives in `services/crops/`.
It implements the Crop role from `roles/03_Backend_Crop_Agriculture.md` and the
shared contract in `START_HERE.md`. Default address: `http://127.0.0.1:8002`.

## Current data and approval status

The eight candidate crop records and nine source records supplied in
`data/processed/mongodb/crop_catalog_document.json` are stored together in
`agrilens_crops.crop_catalogs`. Their original values, source references,
pending-review notes and immutable revision ID are preserved. The import records
its actual creation time as a BSON date. It never overwrites an existing revision.

These records are **staging**, with `approval: null`. `START_HERE.md` still marks
the region, final 4–6 crops, growing calendar and scientific facts Pending.
Importing is not Research approval. The live API therefore returns
`INSUFFICIENT_DATA` (422) for `zankalon_sharkia`; readiness is 503 until an approved
catalog is selected. Use the inspection command below to review your real stored
candidate data, or explicit fixture mode to exercise a successful API response.

## Start locally

Install Node.js 22 or newer, Python 3 and native MongoDB Community 8.0.
Run commands from the repository root. Set `MONGOD_BIN` in the ignored root
`.env` if MongoDB is outside PATH; see [the runtime guide](../../docs/RUNTIME.md).

```sh
npm ci --prefix services/crops
python3 tools/dev.py mongo
```

Keep MongoDB running, then in another terminal:

```sh
npm run import:data --prefix services/crops
npm run verify:data --prefix services/crops
python3 tools/dev.py run crops
```

The importer does not approve or select data. Pin `CROP_CATALOG_ID` only after
approval. The selected database catalog determines the served region; the
service does not infer it from a research file in the checkout.

## Try a successful development response

Stop the Crop HTTP server first so port 8002 is free; keep MongoDB running if you
still want to inspect the stored candidate data. Then run:

```sh
npm run fixture --prefix services/crops
```

In another terminal or a browser:

```sh
curl -i http://127.0.0.1:8002/health
curl -i 'http://127.0.0.1:8002/internal/crops?region_id=sample_region'
curl -i 'http://127.0.0.1:8002/internal/crops?region_id=unknown'
curl -i http://127.0.0.1:8002/internal/crops
```

The first two responses are 200. The last two are 404 `UNKNOWN_REGION` and 400
`INVALID_INPUT`. Successful crop JSON exactly matches `fixtures/crops/catalog.json`.
Fixtures are synthetic and require no database. Every response carries
`X-AgriLens-Data-Mode: fixture` and `Cache-Control: no-store`.
Fixture data is never used as a fallback in live mode.

## Understand the code in this order

1. `src/server.js`: reads configuration and starts HTTP; connects to MongoDB on
   demand and allows subsequent requests to retry failed connections.
2. `src/app.js`: validates requests, provides `/health` and `/internal/crops`, and
   maps failures to the shared error format.
3. `src/config.js`: reads root `.env.example`, then root `.env`, then environment
   variables, using the same precedence as `tools/dev.py`.
4. `src/database.js`: Mongoose `CropCatalog` model, connection timeout and
   repeatable database validator installation.
5. `src/repository.js`: atomic insert of a complete staging catalog; matching
   retries are no-ops; conflicting revisions are rejected.
6. `src/catalog.js`: checks IDs, seasons, months, water ranges, nulls, sources and
   approval status; explicitly projects the shared HTTP fields.
7. `scripts/catalog.js`: imports, verifies or inspects your supplied data.
8. `test/`: HTTP, validation, and actual MongoDB checks.

The entire small crop catalog is one MongoDB document, as the team's storage
design requires. There are no shared Crop/Source tables to join or to expose to
other services. Research-only fields are retained in storage but omitted from
the HTTP response. Numeric unknowns stay `null`; partially unknown water ranges
remain incomplete. The month helper identifies a December–January crossing;
it does not invent which rotation year a winter belongs to.

## Import guarantees

`import:data` first runs the existing research builder with `--check`, which
validates the supplied artifact package without changing files. It validates
the crop catalog before writing, accepts observed staging inputs only, and writes
only to the Crop database. It requires MongoDB 8.0 and a single loopback address.
The collection validator matches the existing Python importer. Incompatible
validators cause an error rather than an automatic schema replacement.

The catalog is inserted atomically. A duplicate ID can only be verified unchanged;
even concurrent matching insert attempts cannot replace existing data. Corrections
need a new revision ID. No import command seals, approves, deletes, or selects a
release. A process interruption before insertion creates no catalog; after
insertion it leaves a complete staging catalog that cannot be served live.

## Tests and handoff

```sh
npm test
npm run test:mongodb
```

The second command requires MongoDB. It creates one uniquely named database ending
in `_fixtures` and removes only that database afterward. It checks actual storage
readback, repeat imports, conflict rejection, schema rejection, sealed-revision
protection, HTTP approval gating, and loss of database connectivity. Unit/HTTP
checks cover the exact fixture contract, nulls, seasons, winter windows, unknown
regions, source resolution, unavailable data, and safe error messages.

Next owner/action: Research resolves the candidate facts and final 4–6 crop
selection; the Lead records the approved region/calendar and release. Follow
`docs/database/implementation-handoff.md` to validate and publish a new immutable
catalog with genuine approval records. Pin that approved ID in `CROP_CATALOG_ID`
and restart the service. A publication command is deliberately not supplied while
approval inputs are missing; manually changing a staging status is not approval.
The adapter rejects unknown schema versions, fixture kinds, missing approvals,
pending crop evidence and unverified growing windows. No approved catalog or
real Comparison integration is claimed by the current tests.

For database tooling background, see [Mongoose connection documentation](https://mongoosejs.com/docs/connections.html).
