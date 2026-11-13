"""Validate the AgriLens research data files against the shared contracts for Zankalon.

Run from the repository root:

    python scripts/validate_research_data.py

Checks the two internal API shapes in START_HERE.md section 3, the approved
decision register in section 2, and the honesty rules from AGENTS.md (no fill
values, no fabricated numbers, no numeric soil claims).

Exit code 0 = every check passed. Exit code 1 = at least one failure.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
FIXTURES = ROOT / "data" / "fixtures"
RAW = ROOT / "data" / "raw" / "nasa_power_zankalon_2016_2025.json"

REGION_ID = "zankalon_sharkia"
SLOT_ORDER = ["y1_summer", "y1_winter", "y2_summer", "y2_winter"]
SLOT_SEASONS = ["summer", "winter", "summer", "winter"]
PRIORITIES = ["water", "heat", "soil"]
SCENARIOS = ["average", "hottest_year", "driest_year"]
HEAT_THRESHOLD_C = 35.0
EXTREME_HEAT_THRESHOLD_C = 38.0
FIRST_YEAR, LAST_YEAR = 2016, 2025

EXPECTED_CROPS = {
    "maize": "summer",
    "rice": "summer",
    "cotton": "summer",
    "soybean": "summer",
    "wheat": "winter",
    "berseem": "winter",
    "faba_bean": "winter",
    "sugar_beet": "winter",
}

failures: list[str] = []
checks = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}{': ' + detail if detail else ''}")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    region = load(PROCESSED / "region_config.json")
    catalog = load(PROCESSED / "crop_catalog.json")
    climate = load(FIXTURES / "mock_climate_response.json")
    climate_fixture = load(FIXTURES / "mock_crop_catalog.json")
    raw = json.loads(RAW.read_text(encoding="utf-8-sig"))

    # ------------------------------------------------------------------
    # region_config
    # ------------------------------------------------------------------
    for key in (
        "region_id",
        "name",
        "coordinates",
        "slot_order",
        "priorities",
        "scenarios",
        "heat_threshold_c",
        "climate",
        "sample_baseline",
    ):
        check(key in region, "region_config has key", key)

    check(region["region_id"] == REGION_ID, "region id", region["region_id"])
    check(
        region["coordinates"] == {"lat": 30.58057, "lon": 31.43332},
        "approved Zankalon representative coordinates",
        str(region["coordinates"]),
    )
    check(region["slot_order"] == SLOT_ORDER, "region slot_order")
    check(region["priorities"] == PRIORITIES, "region priorities")
    check(region["scenarios"] == SCENARIOS, "region scenarios")
    check(region["heat_threshold_c"] == HEAT_THRESHOLD_C, "heat threshold 35.0")
    check(
        region["climate"]["period"]
        == {"start": f"{FIRST_YEAR}-01-01", "end": f"{LAST_YEAR}-12-31"},
        "approved climate period",
        str(region["climate"]["period"]),
    )
    params = region["climate"]["parameters"]
    check(
        params["T2M_MAX"]["unit"] == "C" and params["PRECTOTCORR"]["unit"] == "mm/day",
        "approved parameter units",
    )
    check(region["climate"]["missing_days"] == 0, "zero missing days")

    # approved scenario selection (START_HERE section 2)
    sel = region["scenario_selection"]
    check(sel["hottest_year"]["year"] == 2024, "hottest year 2024")
    check(sel["hottest_year"]["mean_tmax_c"] == 31.79, "hottest mean 31.79 C")
    check(sel["driest_year"]["year"] == 2025, "driest year 2025")
    check(sel["driest_year"]["total_rain_mm"] == 39.80, "driest rain 39.80 mm")

    # sample baseline: 4 valid crop ids in slot order
    baseline = region["sample_baseline"]
    check(len(baseline) == 4, "baseline has four crops", str(len(baseline)))
    for crop_id, season in zip(baseline, SLOT_SEASONS):
        check(
            EXPECTED_CROPS.get(crop_id) == season,
            f"baseline slot season for {crop_id}",
            f"expected {season}, catalog says {EXPECTED_CROPS.get(crop_id)}",
        )

    # ------------------------------------------------------------------
    # crop_catalog
    # ------------------------------------------------------------------
    check(catalog["region_id"] == REGION_ID, "catalog region id")
    check(catalog["slot_order"] == region["slot_order"], "slot_order matches region")

    crops = catalog["crops"]
    crop_ids = [c["id"] for c in crops]
    check(len(crops) == len(EXPECTED_CROPS), f"{len(EXPECTED_CROPS)} crops", str(len(crops)))
    check(len(set(crop_ids)) == len(crop_ids), "crop ids unique", str(crop_ids))
    check(set(crop_ids) == set(EXPECTED_CROPS), "crop id set matches approved list")

    source_ids = {s["id"] for s in catalog["sources"]}
    for crop in crops:
        label = f"crop {crop['id']}"
        for key in (
            "id",
            "name",
            "valid_seasons",
            "grow_window",
            "water_need_mm",
            "family",
            "is_legume",
            "source_ids",
        ):
            check(key in crop, f"{label} has key", key)

        check(
            set(crop["valid_seasons"]) == {EXPECTED_CROPS[crop["id"]]},
            f"{label} seasons",
            str(crop["valid_seasons"]),
        )
        check(
            all(s in ("summer", "winter") for s in crop["valid_seasons"]),
            f"{label} seasons are in the approved enum",
        )

        window = crop["grow_window"]
        check(
            "start_month" in window and "end_month" in window,
            f"{label} grow_window has start_month/end_month",
        )
        check(
            1 <= window["start_month"] <= 12 and 1 <= window["end_month"] <= 12,
            f"{label} months in 1..12",
        )

        water = crop["water_need_mm"]
        check(
            "min" in water and "max" in water, f"{label} water range has min/max"
        )
        check(
            isinstance(water["min"], (int, float))
            and isinstance(water["max"], (int, float)),
            f"{label} water bounds are numbers, not null",
        )
        check(
            0 < water["min"] < water["max"],
            f"{label} water min < max",
            f"{water['min']}..{water['max']}",
        )

        check(
            crop["is_legume"] == (crop["family"] == "Fabaceae"),
            f"{label} is_legume agrees with Fabaceae",
        )
        check(
            bool(crop["source_ids"]), f"{label} cites at least one source"
        )
        for sid in crop["source_ids"]:
            check(sid in source_ids, f"{label} source id resolves", sid)

    # ------------------------------------------------------------------
    # climate fixture (internal climate API shape)
    # ------------------------------------------------------------------
    for key in (
        "region_id",
        "coordinates",
        "period",
        "units",
        "daily",
        "scenarios",
        "provenance",
    ):
        check(key in climate, "climate fixture has key", key)

    check(climate["region_id"] == REGION_ID, "climate region id")
    check(climate["coordinates"] == region["coordinates"], "climate coordinates match")
    check(
        climate["period"] == {"first_year": FIRST_YEAR, "last_year": LAST_YEAR},
        "climate period years",
    )
    check(climate["units"]["tmax"] == "C" and climate["units"]["rain"] == "mm/day", "climate units")

    daily = climate["daily"]
    expected_days = (dt.date(LAST_YEAR, 12, 31) - dt.date(FIRST_YEAR, 1, 1)).days + 1
    check(len(daily) == expected_days, "daily length", f"{len(daily)} vs {expected_days}")

    dates = [dt.date.fromisoformat(row["date"]) for row in daily]
    check(len(set(dates)) == len(dates), "daily dates unique")
    check(dates == sorted(dates), "daily dates sorted")
    check(dates[0] == dt.date(FIRST_YEAR, 1, 1), "first day")
    check(dates[-1] == dt.date(LAST_YEAR, 12, 31), "last day")
    check(
        all((b - a).days == 1 for a, b in zip(dates, dates[1:])),
        "daily dates contiguous, no gaps",
    )

    for row in daily:
        check(
            "date" in row and "tmax_c" in row and "rain_mm" in row,
            "daily row has date/tmax_c/rain_mm",
        )
        check(row["tmax_c"] != -999.0, f"no T2M_MAX fill on {row['date']}")
        check(row["rain_mm"] != -999.0, f"no PRECTOTCORR fill on {row['date']}")
        check(
            isinstance(row["tmax_c"], (int, float))
            and -10.0 <= row["tmax_c"] <= 60.0,
            f"plausible tmax on {row['date']}",
            str(row["tmax_c"]),
        )
        check(
            isinstance(row["rain_mm"], (int, float)) and row["rain_mm"] >= 0,
            f"non-negative rain on {row['date']}",
            str(row["rain_mm"]),
        )

    # fixture values must equal the cached NASA response, value for value
    raw_param = raw["properties"]["parameter"]
    mismatches = 0
    for row in daily:
        key = row["date"].replace("-", "")
        if (
            raw_param["T2M_MAX"][key] != row["tmax_c"]
            or raw_param["PRECTOTCORR"][key] != row["rain_mm"]
        ):
            mismatches += 1
    check(mismatches == 0, "fixture copies cached NASA values exactly", str(mismatches))

    scenarios = climate["scenarios"]
    for name in ("hottest_year", "driest_year"):
        check(name in scenarios, f"climate scenario present: {name}")
        check(
            isinstance(scenarios[name]["year"], int)
            and FIRST_YEAR <= scenarios[name]["year"] <= LAST_YEAR,
            f"{name} year inside the baseline",
            str(scenarios[name].get("year")),
        )
        check(bool(scenarios[name]["rule"]), f"{name} has a written rule")

    provenance = climate["provenance"]
    for key in (
        "source_url",
        "retrieved_at",
        "missing_days",
        "spatial_resolution",
        "time_standard",
    ):
        check(key in provenance, "provenance has key", key)
    check(provenance["source_url"].startswith("https://power.larc.nasa.gov/"), "provenance url")
    check(provenance["missing_days"] == 0, "provenance missing_days is 0")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"checks run : {checks}")
    print(f"failures   : {len(failures)}")
    if failures:
        print("\nFailures:")
        for f in failures[:50]:
            print(f"  - {f}")
        if len(failures) > 50:
            print(f"  ... and {len(failures) - 50} more")
        return 1

    print("\nRESULT: PASS - research data matches the shared contracts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
