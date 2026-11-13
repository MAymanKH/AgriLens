"""Import or verify checked research staging files in local MongoDB.

Run with the MongoDB tooling environment: python tools/dev.py import-data
"""

import argparse
from contextlib import contextmanager
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

from bson import BSON, json_util
from bson.codec_options import CodecOptions
from pymongo import MongoClient, UpdateOne
from pymongo.errors import PyMongoError
from pymongo.uri_parser import parse_uri

from build_research_data import ROOT, prepare, read, require

sys.path.insert(0, str(ROOT / "tools"))
from dev import environment


def load_package(root=ROOT):
    folder = root / "data/processed/mongodb"
    manifest = read(root, "data/processed/mongodb/climate_dataset_document.json")
    outputs = prepare(root, manifest["decision_revision"])
    for name, expected in outputs.items():
        require((root / name).read_bytes() == expected, f"Stale staging file: {name}. Rebuild research data first.")
    # BSON dates have millisecond precision; compare the same representation on retries.
    def load_bson(name):
        document = json_util.loads((folder / name).read_text(),
                                   json_options=json_util.JSONOptions(tz_aware=True))
        return BSON.encode(document).decode(codec_options=CodecOptions(tz_aware=True))
    crop = load_bson("crop_catalog_document.json")
    climate = load_bson("climate_dataset_document.json")
    rows = [json.loads(line) for line in (folder / "climate_daily.jsonl").read_text().splitlines()]
    for document in (crop, climate):
        require(document["status"] == "staging" and document["approval"] is None,
                "This command imports unapproved staging data only")
    return crop, climate, rows


def settings(env):
    require(env["MONGODB_URI"].startswith("mongodb://"), "Use a local mongodb:// connection URI")
    parsed = parse_uri(env["MONGODB_URI"])
    hosts = parsed["nodelist"]
    require(len(hosts) == 1 and hosts[0][0] in {"localhost", "127.0.0.1", "::1"},
            "The development importer requires a single loopback MongoDB address")
    names = [env["CROP_DB_NAME"], env["CLIMATE_DB_NAME"]]
    require(names[0] != names[1], "Crop and climate databases must be distinct")
    require(all(len(name) <= 63 and re.fullmatch(r"[A-Za-z0-9_-]+", name) and
                name not in {"admin", "config", "local"} for name in names), "Invalid development database names")
    return names, f"{hosts[0][1]}:{':'.join(names)}"


@contextmanager
def import_lock(identity):
    """One writer per local port/database pair, across checkouts; OS releases on exit."""
    name = hashlib.sha256(identity.encode()).hexdigest()
    path = Path(tempfile.gettempdir()) / f"agrilens-import-{name}.lock"
    with path.open("a+b") as lock:
        if lock.seek(0, 2) == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            if sys.platform == "win32":
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise ValueError("Another import is using these local databases. Retry when it finishes.") from error
        try:
            yield
        finally:
            if sys.platform == "win32":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def object_schema(required, properties):
    return {"$jsonSchema": {"bsonType": "object", "required": required, "properties": properties}}


TEXT = {"bsonType": "string", "minLength": 1}
NUMBER = {"bsonType": ["int", "long", "double", "decimal", "null"]}
SHARED = {
    "_id": TEXT, "schema_version": {"bsonType": "int", "enum": [1]}, "decision_revision": TEXT,
    "region": object_schema(["id", "name", "coordinates"],
                            {"id": TEXT, "name": TEXT, "coordinates": {"bsonType": "object"}})["$jsonSchema"],
    "kind": {"enum": ["fixture", "observed"]},
    "status": {"enum": ["staging", "sealed", "approved", "rejected"]},
    "created_at": {"bsonType": "date"}, "approval": {"bsonType": ["object", "null"]},
    "limitations": {"bsonType": "array", "items": {"bsonType": "string"}},
}


def schemas():
    crop_fields = {"slot_order": {"bsonType": "array", "minItems": 4, "maxItems": 4},
                   "crops": {"bsonType": "array"}, "sources": {"bsonType": "array"}}
    climate_fields = {key: {"bsonType": "object"} for key in
                      ("period", "units", "parameters", "provenance", "raw_artifact", "validation", "scenarios")}
    daily = {"schema_version": {"bsonType": "int", "enum": [1]}, "dataset_id": TEXT,
             "date": {"bsonType": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"},
             "tmax_c": NUMBER, "rain_mm": {**NUMBER, "minimum": 0}}
    return (object_schema(list(SHARED) + list(crop_fields), {**SHARED, **crop_fields}),
            object_schema(list(SHARED) + list(climate_fields), {**SHARED, **climate_fields}),
            object_schema(list(daily), daily))


def ensure_collection(database, name, validator):
    info = next(database.list_collections(filter={"name": name}), None)
    if info is None:
        return database.create_collection(name, validator=validator,
                                          validationLevel="strict", validationAction="error")
    options = info["options"]
    require(options.get("validator") == validator and options.get("validationLevel") == "strict"
            and options.get("validationAction") == "error",
            f"Incompatible collection validator: {database.name}.{name}. No migration was applied.")
    return database[name]


def collections(client, names, install=False):
    crop_schema, climate_schema, daily_schema = schemas()
    definitions = [(names[0], "crop_catalogs", crop_schema),
                   (names[1], "climate_datasets", climate_schema), (names[1], "climate_daily", daily_schema)]
    if install:
        result = [ensure_collection(client[db], name, schema) for db, name, schema in definitions]
        result[2].create_index([("dataset_id", 1), ("date", 1)], unique=True, name="dataset_date_unique")
    else:
        result = [client[db][name] for db, name, _ in definitions]
        for collection, (_, _, schema) in zip(result, definitions):
            options = collection.options()
            require(options.get("validator") == schema and options.get("validationLevel") == "strict"
                    and options.get("validationAction") == "error", "Missing or incompatible collection validator")
        indexes = result[2].index_information()
        index = indexes.get("dataset_date_unique", {})
        require(index.get("key") == [("dataset_id", 1), ("date", 1)] and index.get("unique") is True,
                "Missing unique dataset/date index")
    return result


def manifest_content(document):
    return {key: value for key, value in document.items() if key != "created_at"}


def inspect_stored(stores, package, complete):
    crops, datasets, daily = stores
    crop, climate, rows = package
    missing = []
    for collection, expected in ((crops, crop), (datasets, climate)):
        actual = collection.find_one({"_id": expected["_id"]})
        if actual is None:
            missing.append(expected["_id"])
        else:
            require(isinstance(actual.get("created_at"), dt.datetime), "Stored creation timestamp must be a BSON date")
            require(manifest_content(actual) == manifest_content(expected),
                    f"Stored revision conflicts with source: {collection.name}. Use a new revision; no overwrite allowed.")
    expected_rows = {row["date"]: row for row in rows}
    actual_rows = list(daily.find({"dataset_id": climate["_id"]}, {"_id": 0}).sort("date", 1))
    require(len({row["date"] for row in actual_rows}) == len(actual_rows), "Duplicate stored dates")
    for row in actual_rows:
        require(expected_rows.get(row["date"]) == row,
                f"Stored daily record conflicts with source at {row['date']}; no overwrite allowed.")
    if complete:
        require(not missing and len(actual_rows) == len(rows), "Import incomplete. Rerun import-data to resume staging records.")
    return len(actual_rows)


def import_package(stores, package):
    """Resume matching staging records, insert missing records, never replace evidence."""
    crops, datasets, daily = stores
    crop, climate, rows = package
    before = inspect_stored(stores, package, complete=False)
    now = dt.datetime.now(dt.timezone.utc)
    for collection, expected in ((crops, crop), (datasets, climate)):
        collection.update_one(manifest_content(expected),
                              {"$setOnInsert": {**expected, "created_at": now}}, upsert=True)
    operations = [UpdateOne(row, {"$setOnInsert": row}, upsert=True) for row in rows]
    daily.bulk_write(operations, ordered=True)
    inspect_stored(stores, package, complete=True)
    return len(rows) - before


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Read back and compare without writing")
    args = parser.parse_args()
    try:
        env = environment()
        names, identity = settings(env)
        package = load_package()
        with import_lock(identity), MongoClient(env["MONGODB_URI"], tz_aware=True,
                                               serverSelectionTimeoutMS=int(env["MONGODB_SERVER_SELECTION_TIMEOUT_MS"])) as client:
            client.admin.command("ping")
            require(client.server_info()["version"].startswith("8.0."), "Use the project's MongoDB Community 8.0 runtime")
            stores = collections(client, names, install=not args.verify)
            added = 0 if args.verify else import_package(stores, package)
            inspect_stored(stores, package, complete=True)
            print(json.dumps({"status": "verified", "databases": names, "crop_catalog_id": package[0]["_id"],
                              "climate_dataset_id": package[1]["_id"], "crops": len(package[0]["crops"]),
                              "daily_records": len(package[2]), "daily_records_inserted": added,
                              "scientific_status": "staging, unapproved"}, indent=2))
        return 0
    except (ValueError, KeyError, TypeError, OSError, PyMongoError) as error:
        # Driver exceptions can include a credential-bearing URI; do not echo them.
        message = type(error).__name__ if isinstance(error, PyMongoError) else str(error)
        print(f"Import failed: {message}. Check local MongoDB and docs/database/local-import.md.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
