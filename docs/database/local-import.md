# Import the research data into local MongoDB

Each developer runs their own MongoDB instance and imports the same versioned files. No shared server, database dump, credentials, or fresh NASA download is needed. This imports eight candidate crop records and 3,653 climate days into staging. It does not approve scientific values or enable a live service.

## Install once

Install [MongoDB Community 8.0](https://www.mongodb.com/docs/manual/installation/) for your operating system. If it already runs on `127.0.0.1:27017`, use that instance. The importer checks the server's 8.0 version. MongoDB 8.0.38 and PyMongo 4.20.0 were used for verification on Linux. Native installation needs no Docker or MongoDB shell.

Use Python 3.11 or newer for the pinned MongoDB driver. From the repository root, create an isolated environment for the import tooling. Backend services can use different languages and drivers. The existing HTTP fixture tools still support Python 3.10 without dependencies.

Linux or macOS:

```sh
python3 -m venv .local/mongo-venv
.local/mongo-venv/bin/python -m pip install -r requirements-mongo.txt
```

Windows PowerShell:

```powershell
py -3 -m venv .local/mongo-venv
.local/mongo-venv/Scripts/python.exe -m pip install -r requirements-mongo.txt
```

The commands below use the Linux/macOS Python path. On Windows, replace `.local/mongo-venv/bin/python` with `.local/mongo-venv/Scripts/python.exe`. No environment activation is required.

## Start and import

If MongoDB is not already running, open a terminal and run:

```sh
.local/mongo-venv/bin/python tools/dev.py mongo
```

Keep that terminal open. Ctrl+C stops MongoDB and retains the data in ignored `.local/mongo/`. Set `MONGOD_BIN` in your optional `.env` to the absolute executable path if `mongod` is not on PATH. On Windows this can point to `mongod.exe`. Use forward slashes in the path; the project's `.env` format uses literal values without quotes.

In another terminal:

```sh
.local/mongo-venv/bin/python tools/dev.py import-data
.local/mongo-venv/bin/python tools/dev.py verify-data
```

The importer uses `.env.example`, optional `.env`, and process environment variables, in that precedence order. A `.env` file is not required for the defaults. Personalize `MONGODB_URI`, `CROP_DB_NAME`, and `CLIMATE_DB_NAME` if another project uses those names or ports. If changing the server port, update both `MONGODB_PORT` and `MONGODB_URI`. The importer accepts only a single loopback address.

Default results:

| Database and collection | Imported records |
|---|---|
| `agrilens_crops.crop_catalogs` | One staging catalog containing eight candidate crops and nine source references |
| `agrilens_climate.climate_datasets` | One staging manifest with evidence and validation references |
| `agrilens_climate.climate_daily` | 3,653 daily documents with a unique dataset/date index |

Both commands print the exact catalog/dataset IDs and record counts. `verify-data` compares the actual MongoDB values with the checked-in files without changing collections or data. Dates used as timestamps are stored as BSON dates, at millisecond precision. Calendar-day dates remain `YYYY-MM-DD` strings. The first import records its actual creation time; retries preserve it.

## Repeat, update, and recover

Run `import-data` again after cloning, pulling updates, or restarting MongoDB. Matching records remain unchanged and a partial staging import resumes with only missing records. Conflicting content under an existing revision fails without replacing that content. Use a newly generated revision for corrections. No command drops collections, deletes datasets, selects the newest revision, or marks data approved. Keep live `CROP_CATALOG_ID` and `CLIMATE_DATASET_ID` settings empty until a release is approved.

The command verifies the source package before connecting. Stale generated files fail with a rebuild instruction; see [the staging procedure](research-staging.md). The separate four-crop proposal remains in Git and is not silently substituted for the eight-crop catalog. Its faba water requirement is unknown, and the retained candidate ranges are not approved live estimates.

Local imports are serialized with an OS lock for the port/database pair, including across checkouts. The OS releases the lock after an interrupted process. A crash can leave staging records, which the next import checks before resuming. Existing incompatible collection validators or indexes cause a failure; the importer does not rewrite schema definitions. Scientific publication and live adapters remain separate work under [the implementation handoff](implementation-handoff.md).

## Run the storage regression checks

With MongoDB running:

```sh
.local/mongo-venv/bin/python -m unittest discover -s scripts -p test_mongodb_import.py
```

These tests use uniquely named databases ending in `_fixtures` and remove only those databases afterward. They exercise real writes, readback, retry stability, partial recovery, conflict rejection, published-record protection, schema validation, a unique index, and the process lock. They do not use or clear your development datasets.
