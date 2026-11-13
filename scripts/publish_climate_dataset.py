"""Validate a sealed climate snapshot and optionally publish it after Research sign-off."""

import argparse
import copy
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import sys

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from build_research_data import ROOT, require
from import_research_data import import_lock, load_package, manifest_content, settings, schemas
sys.path.insert(0, str(ROOT / "tools"))
from dev import environment


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def expected_dates(first_year, last_year):
    dates = []
    current = dt.date(first_year, 1, 1)
    end = dt.date(last_year + 1, 1, 1)
    while current < end:
        dates.append(current.isoformat())
        current += dt.timedelta(days=1)
    return dates


def validate_stored_rows(actual_rows, expected_rows, manifest, raw_bytes, source_report):
    period = manifest["period"]
    wanted_dates = expected_dates(period["first_year"], period["last_year"])
    wanted_set = set(wanted_dates)
    actual_by_date = {}
    issues = []
    for row in actual_rows:
        date = row.get("date")
        try:
            parsed = dt.date.fromisoformat(date)
        except (TypeError, ValueError):
            issues.append(f"Invalid calendar date: {date!r}")
            continue
        if parsed.isoformat() != date:
            issues.append(f"Noncanonical date: {date!r}")
            continue
        if date not in wanted_set:
            issues.append(f"Date outside declared period: {date}")
            continue
        if date in actual_by_date:
            issues.append(f"Duplicate date: {date}")
            continue
        actual_by_date[date] = row

        tmax = row.get("tmax_c")
        rain = row.get("rain_mm")
        if type(tmax) not in (int, float) or not math.isfinite(tmax) or tmax <= -900:
            issues.append(f"Invalid Tmax or NASA fill marker on {date}")
        elif not -90 <= tmax <= 65:
            issues.append(f"Tmax outside supported physical range on {date}")
        if type(rain) not in (int, float) or not math.isfinite(rain) or rain <= -900 or rain < 0:
            issues.append(f"Invalid precipitation or NASA fill marker on {date}")

    missing = [date for date in wanted_dates if date not in actual_by_date]
    if missing:
        issues.append(f"Missing {len(missing)} expected date(s): {', '.join(missing[:5])}")

    expected_by_date = {row["date"]: row for row in expected_rows}
    for date in wanted_dates:
        if date in actual_by_date and actual_by_date[date] != expected_by_date.get(date):
            issues.append(f"Stored climate record differs from the checked bundle on {date}")
            break

    expected_count = len(wanted_dates)
    if len(actual_rows) != expected_count or manifest["validation"].get("expected_days") != expected_count:
        issues.append("Stored count or manifest expected_days does not match the inclusive calendar period")
    if manifest["validation"].get("record_count") != len(actual_rows):
        issues.append("Manifest record_count does not match stored climate rows")
    if manifest["provenance"].get("missing_days") != 0:
        issues.append("Manifest missing_days is not zero")

    complete_years = []
    for year in range(period["first_year"], period["last_year"] + 1):
        year_dates = [date for date in wanted_dates if date.startswith(f"{year}-")]
        if year_dates and all(
            date in actual_by_date and
            type(actual_by_date[date].get("tmax_c")) in (int, float) and
            type(actual_by_date[date].get("rain_mm")) in (int, float) and
            math.isfinite(actual_by_date[date]["tmax_c"]) and
            math.isfinite(actual_by_date[date]["rain_mm"]) and
            -90 <= actual_by_date[date]["tmax_c"] <= 65 and
            actual_by_date[date]["rain_mm"] >= 0
            for date in year_dates
        ):
            complete_years.append(year)
    if manifest["validation"].get("complete_years") != complete_years:
        issues.append("Manifest complete_years does not match actual daily observations")
    for name in ("hottest_year", "driest_year"):
        scenario = manifest.get("scenarios", {}).get(name, {})
        year = scenario.get("year")
        if year is not None and year not in complete_years:
            issues.append(f"Scenario {name} selects incomplete year {year}")

    raw_digest = sha256(raw_bytes)
    if raw_digest != manifest.get("raw_artifact", {}).get("sha256"):
        issues.append("Original NASA artifact checksum does not match the manifest")
    if source_report.get("integrity_checks") != "passed" or source_report.get("decision_revision") != manifest.get("decision_revision"):
        issues.append("Checked source validation report is missing or belongs to another decision revision")
    if source_report.get("raw_sha256") != raw_digest or source_report.get("normalized_sha256") != manifest["validation"].get("normalized_sha256"):
        issues.append("Manifest checksums do not match the checked source validation report")
    if source_report.get("absent_dates") or source_report.get("invalid_parameters"):
        issues.append("Checked source report contains date or measurement failures")

    leap_days = [date for date in wanted_dates if date.endswith("-02-29")]
    return {
        "issues": issues,
        "expected_days": expected_count,
        "stored_days": len(actual_rows),
        "complete_years": complete_years,
        "leap_days_checked": leap_days,
        "raw_sha256": raw_digest,
        "normalized_sha256": manifest["validation"].get("normalized_sha256"),
        "NASA_fill_rule": "Reject finite numeric values <= -900; missing values must be explicit nulls and cannot count toward complete years.",
    }


def check_manifest(actual, expected):
    require(actual is not None, "Climate dataset manifest is missing from MongoDB")
    require(actual.get("status") in {"staging", "sealed", "approved"}, "Dataset is rejected or has an unknown publication state")
    actual_compare = copy.deepcopy(actual)
    expected_compare = copy.deepcopy(expected)
    for value in (actual_compare, expected_compare):
        value.pop("created_at", None)
        value["status"] = "staging"
        value["approval"] = None
    actual_report = actual_compare.get("validation", {}).get("report_uri")
    expected_report = expected_compare.get("validation", {}).get("report_uri")
    if actual_report != expected_report:
        actual_compare["validation"]["report_uri"] = expected_report
    require(manifest_content(actual_compare) == manifest_content(expected_compare),
            "Stored climate manifest differs from the checked revision")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", required=True, help="Exact immutable climate dataset ID")
    parser.add_argument("--research-record", help="Research approval reference; omit to validate and leave sealed")
    args = parser.parse_args()
    try:
        env = environment()
        names, identity = settings(env)
        _crop, expected_manifest, expected_rows = load_package()
        require(args.dataset_id == expected_manifest["_id"], "Dataset ID does not match the checked source bundle")
        if args.research_record:
            require(bool(args.research_record.strip()), "Research approval reference cannot be empty")

        raw_path = (ROOT / expected_manifest["raw_artifact"]["uri"]).resolve()
        require(raw_path.is_relative_to(ROOT.resolve()), "Raw artifact path must remain inside the repository")
        raw_bytes = raw_path.read_bytes()
        source_report = json.loads((ROOT / expected_manifest["validation"]["report_uri"]).read_text())
        report_relative = f"data/processed/mongodb/reports/{args.dataset_id}-validation.json"
        report_path = ROOT / report_relative

        with import_lock(identity), MongoClient(
            env["MONGODB_URI"], tz_aware=True,
            serverSelectionTimeoutMS=int(env["MONGODB_SERVER_SELECTION_TIMEOUT_MS"]),
        ) as client:
            client.admin.command("ping")
            require(client.server_info()["version"].startswith("8.0."), "Use the project's MongoDB Community 8.0 runtime")
            database = client[names[1]]
            datasets = database["climate_datasets"]
            daily = database["climate_daily"]
            _crop_schema, dataset_schema, daily_schema = schemas()
            for collection, schema in ((datasets, dataset_schema), (daily, daily_schema)):
                options = collection.options()
                require(options.get("validator") == schema and options.get("validationLevel") == "strict" and
                        options.get("validationAction") == "error", f"Missing or incompatible validator on {collection.name}")
            index = daily.index_information().get("dataset_date_unique", {})
            require(index.get("key") == [("dataset_id", 1), ("date", 1)] and index.get("unique") is True,
                    "Missing unique dataset/date index")

            actual_manifest = datasets.find_one({"_id": args.dataset_id})
            check_manifest(actual_manifest, expected_manifest)
            status = actual_manifest["status"]
            if status == "staging":
                changed = datasets.update_one(
                    {"_id": args.dataset_id, "status": "staging", "kind": "observed"},
                    {"$set": {"status": "sealed"}},
                )
                require(changed.modified_count == 1, "Could not conditionally seal the climate revision")
                actual_manifest = datasets.find_one({"_id": args.dataset_id})
            elif status == "rejected":
                raise ValueError("Rejected revisions are immutable; import corrections as a new dataset ID")

            actual_rows = list(daily.find({"dataset_id": args.dataset_id}, {"_id": 0}).sort("date", 1))
            results = validate_stored_rows(actual_rows, expected_rows, expected_manifest, raw_bytes, source_report)
            if actual_manifest["status"] == "approved":
                require(not results["issues"], "Approved climate revision no longer passes validation")
                approval = actual_manifest.get("approval", {})
                require(args.research_record is None or approval.get("research_record") == args.research_record,
                        "Approved revision has a different immutable Research approval record")
                require(report_path.is_file(), "Durable validation report is missing")
                existing_report = json.loads(report_path.read_text())
                report_digest = sha256(canonical(existing_report))
                require(approval.get("technical_record") == f"{report_relative}#sha256={report_digest}",
                        "Approved revision's validation report checksum does not match its approval")
                print(json.dumps({"status": "approved", "dataset_id": args.dataset_id,
                                  "idempotent": True}, indent=2))
                return 0

            report = {
                "report_version": 1,
                "dataset_id": args.dataset_id,
                "decision_revision": expected_manifest["decision_revision"],
                "validated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "result": "passed" if not results["issues"] else "failed",
                **results,
            }
            report_path.parent.mkdir(parents=True, exist_ok=True)
            if report_path.exists():
                existing_report = json.loads(report_path.read_text())
                comparable = {key: value for key, value in existing_report.items() if key != "validated_at"}
                current_comparable = {key: value for key, value in report.items() if key != "validated_at"}
                if args.research_record:
                    require(comparable == current_comparable,
                            "Validation report changed since it was produced; have Research review the new report before publishing")
                    report = existing_report
                elif comparable != current_comparable:
                    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
            else:
                report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
            report_digest = sha256(canonical(report))
            datasets.update_one(
                {"_id": args.dataset_id, "status": "sealed"},
                {"$set": {"validation.report_uri": report_relative}},
            )

            if results["issues"]:
                datasets.update_one(
                    {"_id": args.dataset_id, "status": "sealed"},
                    {"$set": {"status": "rejected"}},
                )
                raise ValueError("Climate validation failed: " + "; ".join(results["issues"][:5]))

            if not args.research_record:
                print(json.dumps({"status": "sealed", "validation": "passed", "report_uri": report_relative,
                                  "next_step": "Have Research review this report, then rerun with --research-record <approval reference>."}, indent=2))
                return 0

            now = dt.datetime.now(dt.timezone.utc)
            technical_record = f"{report_relative}#sha256={report_digest}"
            result = datasets.update_one(
                {"_id": args.dataset_id, "status": "sealed", "kind": "observed",
                 "validation.report_uri": report_relative,
                 "validation.normalized_sha256": expected_manifest["validation"]["normalized_sha256"]},
                {"$set": {
                    "status": "approved",
                    "approval": {"research_record": args.research_record,
                                 "technical_record": technical_record, "approved_at": now},
                }},
            )
            require(result.modified_count == 1, "Could not conditionally approve this exact sealed revision")
            print(json.dumps({"status": "approved", "dataset_id": args.dataset_id,
                              "research_record": args.research_record,
                              "technical_record": technical_record}, indent=2))
        return 0
    except (ValueError, KeyError, TypeError, OSError, PyMongoError) as error:
        message = type(error).__name__ if isinstance(error, PyMongoError) else str(error)
        print(f"Climate publication failed: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

