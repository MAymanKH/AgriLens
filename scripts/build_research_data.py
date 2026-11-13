"""Rebuild Zankalon fixtures and MongoDB staging files from retained evidence.

This checks data integrity, not scientific approval. No database writes occur.
"""

import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import subprocess

from fetch_and_process_zankalon import process_zankalon

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = "data/raw/nasa_power_zankalon_2016_2025.json"
SLOTS = ["y1_summer", "y1_winter", "y2_summer", "y2_winter"]
CROP_FIELDS = ("id", "name", "valid_seasons", "grow_window", "water_need_mm",
               "family", "is_legume", "source_ids")
PARAMETERS = {
    "tmax": "T2M_MAX", "tmin": "T2M_MIN", "rh": "RH2M",
    "rain": "PRECTOTCORR", "solar_radiation": "ALLSKY_SFC_SW_DWN",
    "wind_speed": "WS2M",
}


def canonical(value):
    """UTF-8, sorted keys, compact separators, no nonfinite numbers."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def read(root, name):
    return json.loads((root / name).read_text(encoding="utf-8-sig"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def prepare(root, revision, retrieved_at=None):
    require(re.fullmatch(r"[0-9a-f]{40}", revision), "Use an exact 40-character decision commit")
    raw_bytes = (root / RAW_PATH).read_bytes()
    raw = json.loads(raw_bytes.decode("utf-8-sig"))
    region = read(root, "data/processed/region_config.json")
    catalog = read(root, "data/processed/crop_catalog.json")
    old_climate = read(root, "data/processed/climate_daily_clean.json")
    require(region["region_id"] == catalog["region_id"] == "zankalon_sharkia", "Region mismatch")
    require(region["coordinates"] == {"lat": 30.58057, "lon": 31.43332}, "Unexpected coordinates")
    require(region["slot_order"] == catalog["slot_order"] == SLOTS, "Slot order mismatch")
    require(raw["header"]["start"] == "20160101" and raw["header"]["end"] == "20251231", "Raw period mismatch")
    require(raw["header"]["time_standard"] in {"LST", "UTC"}, "Unknown raw time standard")
    lon, lat = raw["geometry"]["coordinates"][:2]
    require(abs(lon - region["coordinates"]["lon"]) < .001 and
            abs(lat - region["coordinates"]["lat"]) < .001, "Raw coordinates mismatch")
    dates = [dt.date(2016, 1, 1) + dt.timedelta(days=i) for i in range(3653)]
    keys = {date.strftime("%Y%m%d") for date in dates}
    expected_units = dict(zip(PARAMETERS.values(), ["C", "C", "%", "mm/day", "MJ/m^2/day", "m/s"]))
    for parameter, unit in expected_units.items():
        values = raw["properties"]["parameter"][parameter]
        require(set(values) == keys, f"Missing or extra dates in {parameter}")
        require(raw["parameters"][parameter]["units"] == unit, f"Unit mismatch for {parameter}")
        require(all(type(v) in (int, float) and math.isfinite(v) and v > -900
                    for v in values.values()), f"Invalid or missing measurement in {parameter}")
        if parameter in {"PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "WS2M"}:
            require(all(v >= 0 for v in values.values()), f"Negative measurement in {parameter}")
        if parameter == "RH2M":
            require(all(0 <= v <= 100 for v in values.values()), "Humidity outside 0–100")
    require(all(raw["properties"]["parameter"]["T2M_MIN"][k] <=
                raw["properties"]["parameter"]["T2M_MAX"][k] for k in keys), "Tmin exceeds Tmax")
    timestamp = retrieved_at or old_climate["provenance"]["retrieved_at"]
    require(dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00")).utcoffset() == dt.timedelta(0), "Retrieval timestamp must be UTC")
    with contextlib.redirect_stdout(io.StringIO()):
        climate = process_zankalon(raw, timestamp)
    require(all(all(v is None or type(v) not in (int, float) or math.isfinite(v)
                    for v in row.values()) for row in climate["daily"]), "Nonfinite derived measurement")

    ledger = (root / "docs/SOURCES.md").read_text()
    titles = dict(re.findall(
        r"^### `([^`\r\n]+)`[ \t]*\r?\n(?:[ \t]*\r?\n)*"
        r"- (?:\*\*Title:\*\*|Title:)[ \t]+([^\r\n]+)", ledger, re.MULTILINE))
    sources = catalog["sources"]
    ids = {s["id"] for s in sources}
    require(len(ids) == len(sources), "Duplicate source IDs")
    require(len({c["id"] for c in catalog["crops"]}) == len(catalog["crops"]), "Duplicate crop IDs")
    for source in sources:
        require(source["id"] in titles, f"Missing ledger title for {source['id']}")
    for crop in catalog["crops"]:
        require(all(key in crop for key in CROP_FIELDS), f"Incomplete crop {crop.get('id')}")
        require(set(crop["source_ids"]) <= ids and bool(crop["source_ids"]), f"Unresolved crop sources: {crop['id']}")
        require(bool(crop["valid_seasons"]) and set(crop["valid_seasons"]) <= {"summer", "winter"}, "Invalid crop seasons")
        require(all(type(crop["grow_window"][key]) is int and 1 <= crop["grow_window"][key] <= 12
                    for key in ("start_month", "end_month")), "Invalid growing months")
        water = crop["water_need_mm"]
        require(all(v is None or (type(v) in (int, float) and math.isfinite(v) and v >= 0)
                    for v in (water["min"], water["max"])), "Invalid water range")
        require(water["min"] is None or water["max"] is None or water["min"] <= water["max"], "Reversed water range")

    dataset_id = "climate-zankalon_sharkia-2016_2025-staging-" + revision
    metadata = {key: value for key, value in climate.items() if key != "daily"}
    normalized = {"metadata": metadata, "daily": climate["daily"],
                  "parameters": PARAMETERS, "method_ref": f"{revision}:docs/METHOD.md"}
    raw_hash = sha256(raw_bytes)
    normalized_hash = sha256(canonical(normalized))
    report_path = "data/processed/mongodb/validation_report.json"
    warnings = ["Research evidence and method review remains open on PR #1.",
                "Scenario selection integrity does not establish four-slot cross-year eligibility."]
    if not 4 <= len(catalog["crops"]) <= 6:
        warnings.append(f"{len(catalog['crops'])} candidate crops are outside the published 4–6 crop scope.")
    rain_year = region["scenario_selection"]["driest_year"]["year"]
    retained_rain = round(sum(row["rain_mm"] for row in climate["daily"]
                             if row["date"].startswith(str(rain_year))), 2)
    configured_rain = region["scenario_selection"]["driest_year"]["total_rain_mm"]
    if retained_rain != configured_rain:
        warnings.append(f"Region configuration says {rain_year} rain is {configured_rain:.2f} mm; retained daily records sum to {retained_rain:.2f} mm.")
    report = {
        "decision_revision": revision, "scientific_approval": False,
        "integrity_checks": "passed", "expected_days": len(dates), "record_count": len(climate["daily"]),
        "absent_dates": [], "invalid_parameters": [], "complete_years": list(range(2016, 2026)),
        "raw_sha256": raw_hash, "normalized_sha256": normalized_hash,
        "normalized_serialization": "UTF-8 JSON, sorted keys, compact separators, ensure_ascii=False, allow_nan=False",
        "normalized_content": "metadata and daily from climate_daily_clean.json, parameters and method_ref from climate manifest validation",
        "warnings": warnings,
    }
    manifest_path = root / "data/processed/mongodb/climate_dataset_document.json"
    created_at = (json.loads(manifest_path.read_text())["created_at"] if manifest_path.exists()
                  else {"$date": timestamp})
    shared = {
        "schema_version": 1, "decision_revision": revision,
        "region": {"id": region["region_id"], "name": region["name"], "coordinates": region["coordinates"]},
        "kind": "observed", "status": "staging", "created_at": created_at,
        "approval": None,
        "limitations": ["Candidate research inputs. Not approved for live comparisons.",
                        "A new database import must record its actual creation timestamp.",
                        "Source titles are copied from the candidate Research ledger; citation review remains open."],
    }
    mongo_crop = {
        **shared, "_id": "catalog-zankalon_sharkia-staging-" + revision,
        "slot_order": catalog["slot_order"], "crops": catalog["crops"],
        "sources": [{**s, "title": titles[s["id"]]} for s in sources],
    }
    mongo_climate = {
        **shared, "_id": dataset_id, "period": climate["period"], "units": climate["units"],
        "parameters": PARAMETERS,
        "provenance": {**climate["provenance"], "retrieved_at": {"$date": timestamp}},
        "raw_artifact": {"uri": RAW_PATH, "sha256": raw_hash},
        "validation": {"method_ref": f"{revision}:docs/METHOD.md", "expected_days": len(dates),
                       "record_count": len(climate["daily"]), "complete_years": list(range(2016, 2026)),
                       "report_uri": report_path, "normalized_sha256": normalized_hash},
        "scenarios": climate["scenarios"],
    }
    crop_fixture = {"region_id": catalog["region_id"], "slot_order": catalog["slot_order"],
                    "crops": [{**{k: c[k] for k in CROP_FIELDS},
                               "grow_window": {k: c["grow_window"][k] for k in ("start_month", "end_month")}}
                              for c in catalog["crops"]], "sources": sources}
    region["climate"]["time_standard"] = raw["header"]["time_standard"]
    outputs = {
        "data/processed/region_config.json": region,
        "data/processed/climate_daily_clean.json": climate,
        "data/fixtures/mock_climate_response.json": climate,
        "data/fixtures/mock_crop_catalog.json": crop_fixture,
        "data/processed/mongodb/crop_catalog_document.json": mongo_crop,
        "data/processed/mongodb/climate_dataset_document.json": mongo_climate,
        report_path: report,
    }
    serialized = {name: (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
                  for name, value in outputs.items()}
    serialized["data/processed/mongodb/climate_daily.jsonl"] = b"".join(
        canonical({"schema_version": 1, "dataset_id": dataset_id, **row}) + b"\n"
        for row in climate["daily"])
    return serialized


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare without writing")
    parser.add_argument("--decision-revision", help="Exact commit for the input decisions and method")
    parser.add_argument("--retrieved-at", help="UTC retrieval time, only for newly fetched raw evidence")
    args = parser.parse_args()
    manifest = ROOT / "data/processed/mongodb/climate_dataset_document.json"
    pinned = read(ROOT, str(manifest.relative_to(ROOT))).get("decision_revision") if manifest.exists() else None
    revision = args.decision_revision or (pinned if pinned and re.fullmatch(r"[0-9a-f]{40}", pinned) else
                                         subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip())
    try:
        outputs = prepare(ROOT, revision, args.retrieved_at)
        changed = [name for name, data in outputs.items() if not (ROOT / name).exists() or (ROOT / name).read_bytes() != data]
        if args.check:
            require(not changed, "Stale generated files: " + ", ".join(changed))
        else:
            for name, data in outputs.items():
                (ROOT / name).parent.mkdir(parents=True, exist_ok=True)
                (ROOT / name).write_bytes(data)
        print(f"PASS: {len(outputs)} reproducible staging files. Scientific approval remains pending.")
        return 0
    except (ValueError, KeyError, TypeError) as error:
        print(f"FAIL: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
