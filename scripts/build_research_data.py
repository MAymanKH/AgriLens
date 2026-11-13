"""Build AgriLens research data files from the cached NASA POWER response.

Run from the repository root:

    python scripts/build_research_data.py

Inputs
------
data/raw/nasa_power_kafr_el_sheikh_2014_2023.json
    Unmodified NASA POWER daily point response for Kafr El-Sheikh,
    T2M_MAX + PRECTOTCORR, 2014-01-01 .. 2023-12-31.

Outputs
-------
data/processed/region_config.json
data/processed/crop_catalog.json
data/fixtures/mock_climate_response.json
data/fixtures/mock_crop_catalog.json

The script does not download anything. It fails loudly if the cached series
is incomplete, duplicated or contains NASA fill values.
"""

from __future__ import annotations

import datetime as dt
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "nasa_power_kafr_el_sheikh_2014_2023.json"
PROCESSED = ROOT / "data" / "processed"
FIXTURES = ROOT / "data" / "fixtures"

REGION_ID = "kafr_el_sheikh"
LAT = 31.1107
LON = 30.9388
FIRST_DAY = dt.date(2014, 1, 1)
LAST_DAY = dt.date(2023, 12, 31)
HEAT_THRESHOLD_C = 35.0
SLOT_ORDER = ["y1_summer", "y1_winter", "y2_summer", "y2_winter"]
SAMPLE_BASELINE = ["maize", "wheat", "soybean", "berseem"]

SOURCE_URL = (
    "https://power.larc.nasa.gov/api/temporal/daily/point"
    "?parameters=T2M_MAX,PRECTOTCORR&community=AG"
    "&longitude=30.9388&latitude=31.1107"
    "&start=20140101&end=20231231&format=JSON"
)

# ---------------------------------------------------------------------------
# Source register. Crop `source_ids` and `sources` must resolve inside the
# crop catalog; the climate ids are repeated in the region config.
# ---------------------------------------------------------------------------

SOURCES = [
    {
        "id": "SRC-NASA-POWER-DAILY",
        "url": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        "supports": (
            "NASA POWER daily point API: request format, daily time step, "
            "LST time standard, fill value -999 and cached-response provenance."
        ),
    },
    {
        "id": "SRC-NASA-POWER-PARAMS",
        "url": "https://power.larc.nasa.gov/docs/tutorials/parameters/",
        "supports": (
            "Parameter definitions and units: T2M_MAX (Temperature at 2 Meters "
            "Maximum, degC) and PRECTOTCORR (Precipitation Corrected, mm/day)."
        ),
    },
    {
        "id": "SRC-FAO-CROPWATER",
        "url": "https://www.fao.org/4/s2022e/s2022e07.htm",
        "supports": (
            "FAO Chapter 3 crop water needs, Table 14 indicative crop water need "
            "ranges (mm per total growing period) for maize, cotton, soybean, "
            "wheat and bean; also Table 8/9 crop factors and the warning that "
            "values are rough estimates for data-poor situations."
        ),
    },
    {
        "id": "SRC-FAO-CALENDAR-EG-DELTA",
        "url": (
            "https://api-cropcalendar.apps.fao.org/api/v1/countries/EG/"
            "cropCalendar?language=en&aez=001"
        ),
        "supports": (
            "FAO Crop Calendar, Egypt, Delta region (AEZ 001): sowing and harvest "
            "windows for bread wheat, broad (faba) bean and soybean, with growing "
            "period in days. Last updated 26/02/2021."
        ),
    },
    {
        "id": "SRC-USDA-COTTON-EG",
        "url": (
            "https://apps.fas.usda.gov/newgainapi/api/Report/"
            "DownloadReportByFileName?fileName=Cotton%20and%20Products%20Annual"
            "_Cairo_Egypt_EG2026-0003.pdf"
        ),
        "supports": (
            "USDA FAS Cotton and Products Annual, Egypt (EG2026-0003): Egyptian "
            "cotton planting mid-March to mid-May, harvest September to "
            "mid-December, Nile Delta growing conditions."
        ),
    },
    {
        "id": "SRC-MALR-MAIZE-CALENDAR",
        "url": (
            "https://www.youm7.com/story/2024/4/25/"
            "%D8%AA%D8%B9%D8%B1%D9%81-%D8%B9%D9%84%D9%89-"
            "%D9%85%D9%88%D8%A7%D8%B9%D9%8A%D8%AF-%D8%B2%D8%B1%D8%A7%D8%B9%D8%A9-"
            "%D8%A7%D9%84%D8%B0%D8%B1%D8%A9-%D8%A7%D9%84%D8%B4%D8%A7%D9%85%D9%8A%D8%A9"
            "-%D9%81%D9%89-%D8%A7%D9%84%D8%A3%D8%B1%D8%A7%D8%B6%D9%89-"
            "%D8%A7%D9%84%D9%82%D8%AF%D9%8A%D9%85%D8%A9-%D9%88%D8%A7%D9%84%D8%AC%D8%AF%D9%8A%D8%AF%D8%A9/6541054"
        ),
        "supports": (
            "Egyptian Ministry of Agriculture / Agricultural Research Center "
            "maize guidance reported by Youm7 (25 Apr 2024): old-land summer "
            "maize is sown in May; new-land sowing mid-May to mid-June."
        ),
    },
    {
        "id": "SRC-MALR-BERSEEM-CALENDAR",
        "url": "https://www.elaard.com/133518",
        "supports": (
            "Egyptian Agricultural Research Center professor (Field Crops and "
            "Seed Technology) quoted by El-Aard (21 Sep 2026): optimal berseem "
            "sowing is the first two weeks of October."
        ),
    },
    {
        "id": "SRC-ARC-BERSEEM-WATER",
        "url": "https://moa.gov.eg/media/ezzhbcr5/1-2.pdf",
        "supports": (
            "Darwesh (2018), Soils, Water and Environment Research Institute, "
            "ARC: Egyptian clover full water requirement 577.7 and 546.4 mm "
            "(dry cultivation) and 634.5 and 600.0 mm (wet cultivation) in two "
            "winter seasons at the North Middle Nile Delta (Sakha area)."
        ),
    },
    {
        "id": "SRC-EGY-FABA-WATER",
        "url": "https://journals.ekb.eg/article_135777.html",
        "supports": (
            "Fayed and Abdrabbo (2019), Irrigation Requirements of Faba-bean "
            "Under Two Climatic Locations in Egypt: seasonal faba bean water use "
            "of 300-400 mm in the study region, citing Bahnas and Bondok (2010), "
            "Hegab et al. (2014), Fayed et al. (2018) and Mansour et al. (2019)."
        ),
    },
    {
        "id": "SRC-FAO-SPECIES-DIVERSIFICATION",
        "url": (
            "https://www.fao.org/conservation-agriculture/in-practice/"
            "species-diversification/en/"
        ),
        "supports": (
            "FAO conservation agriculture, species diversification: qualitative "
            "rotation effects (pest/disease carry-over, root exploration, "
            "nitrogen fixation, humus formation). No numeric soil score."
        ),
    },
]

CROPS = [
    {
        "id": "maize",
        "name": "Maize (grain)",
        "valid_seasons": ["summer"],
        "grow_window": {"start_month": 5, "end_month": 9},
        "water_need_mm": {"min": 500, "max": 800},
        "family": "Poaceae",
        "is_legume": False,
        "source_ids": ["SRC-FAO-CROPWATER", "SRC-MALR-MAIZE-CALENDAR"],
        "water_basis": (
            "FAO Table 14 indicative range for maize grain (500-800 mm per total "
            "growing period). Not measured Egyptian irrigation."
        ),
        "window_basis": (
            "Old-land summer maize sown in May; harvest from mid-September. Month "
            "window May-September is a model approximation."
        ),
    },
    {
        "id": "cotton",
        "name": "Cotton",
        "valid_seasons": ["summer"],
        "grow_window": {"start_month": 3, "end_month": 11},
        "water_need_mm": {"min": 700, "max": 1300},
        "family": "Malvaceae",
        "is_legume": False,
        "source_ids": ["SRC-FAO-CROPWATER", "SRC-USDA-COTTON-EG"],
        "water_basis": (
            "FAO Table 14 indicative range for cotton (700-1300 mm per total "
            "growing period). The upper bound reflects a long growing period."
        ),
        "window_basis": (
            "Planting mid-March to mid-May, harvest September to mid-December in "
            "the Nile Delta. March-November is a field-occupancy approximation; "
            "picking may continue into December."
        ),
    },
    {
        "id": "soybean",
        "name": "Soybean",
        "valid_seasons": ["summer"],
        "grow_window": {"start_month": 5, "end_month": 9},
        "water_need_mm": {"min": 450, "max": 700},
        "family": "Fabaceae",
        "is_legume": True,
        "source_ids": ["SRC-FAO-CROPWATER", "SRC-FAO-CALENDAR-EG-DELTA"],
        "water_basis": (
            "FAO Table 14 indicative range for soybean (450-700 mm per total "
            "growing period)."
        ),
        "window_basis": (
            "FAO Delta calendar: sowing 1-25 May, harvest 1 September-20 October, "
            "95-120 days. May-September is a model approximation."
        ),
    },
    {
        "id": "wheat",
        "name": "Wheat (bread)",
        "valid_seasons": ["winter"],
        "grow_window": {"start_month": 11, "end_month": 5},
        "water_need_mm": {"min": 450, "max": 650},
        "family": "Poaceae",
        "is_legume": False,
        "source_ids": ["SRC-FAO-CROPWATER", "SRC-FAO-CALENDAR-EG-DELTA"],
        "water_basis": (
            "FAO Table 14 indicative range for barley/oats/wheat (450-650 mm per "
            "total growing period)."
        ),
        "window_basis": (
            "FAO Delta calendar: sowing 15-30 November, harvest 25 April-25 May, "
            "150-190 days. November-May crosses the calendar-year boundary."
        ),
    },
    {
        "id": "berseem",
        "name": "Egyptian clover (berseem)",
        "valid_seasons": ["winter"],
        "grow_window": {"start_month": 10, "end_month": 5},
        "water_need_mm": {"min": 546, "max": 635},
        "family": "Fabaceae",
        "is_legume": True,
        "source_ids": ["SRC-ARC-BERSEEM-WATER", "SRC-MALR-BERSEEM-CALENDAR"],
        "water_basis": (
            "Egyptian field study at Sakha (North Middle Nile Delta), two winter "
            "seasons: full water requirement 546.4-634.5 mm across dry and wet "
            "cultivation. Single research site, not a governorate average."
        ),
        "window_basis": (
            "ARC guidance: sow in the first two weeks of October; multi-cut forage "
            "harvested through May. October-May crosses the calendar-year boundary."
        ),
    },
    {
        "id": "faba_bean",
        "name": "Faba bean",
        "valid_seasons": ["winter"],
        "grow_window": {"start_month": 10, "end_month": 4},
        "water_need_mm": {"min": 300, "max": 500},
        "family": "Fabaceae",
        "is_legume": True,
        "source_ids": [
            "SRC-EGY-FABA-WATER",
            "SRC-FAO-CROPWATER",
            "SRC-FAO-CALENDAR-EG-DELTA",
        ],
        "water_basis": (
            "Egyptian studies report 300-400 mm seasonal water use (Fayed and "
            "Abdrabbo, 2019); FAO Table 14 'Bean' indicative upper bound is "
            "500 mm. Range 300-500 mm brackets both, with the Egyptian evidence "
            "as the tighter local estimate."
        ),
        "window_basis": (
            "FAO Delta calendar: sowing 1 October-15 November, harvest 15 April-"
            "1 May, 180-190 days. October-April is a model approximation."
        ),
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def load_daily() -> dict[dt.date, dict[str, float]]:
    payload = json.loads(RAW.read_text(encoding="utf-8-sig"))
    parameter = payload["properties"]["parameter"]
    tmax_raw = parameter["T2M_MAX"]
    rain_raw = parameter["PRECTOTCORR"]

    if set(tmax_raw) != set(rain_raw):
        raise ValueError("T2M_MAX and PRECTOTCORR date keys differ")

    daily: dict[dt.date, dict[str, float]] = {}
    for key in sorted(tmax_raw):
        day = dt.datetime.strptime(key, "%Y%m%d").date()
        daily[day] = {"tmax_c": tmax_raw[key], "rain_mm": rain_raw[key]}

    # --- integrity checks -------------------------------------------------
    expected = (LAST_DAY - FIRST_DAY).days + 1
    if len(daily) != expected:
        raise ValueError(f"expected {expected} days, found {len(daily)}")
    if min(daily) != FIRST_DAY or max(daily) != LAST_DAY:
        raise ValueError(f"period mismatch: {min(daily)} .. {max(daily)}")

    cursor = FIRST_DAY
    while cursor <= LAST_DAY:
        if cursor not in daily:
            raise ValueError(f"missing date {cursor}")
        row = daily[cursor]
        if row["tmax_c"] == -999.0 or row["rain_mm"] == -999.0:
            raise ValueError(f"NASA fill value on {cursor}")
        if not (-10.0 <= row["tmax_c"] <= 60.0):
            raise ValueError(f"implausible T2M_MAX on {cursor}: {row['tmax_c']}")
        if row["rain_mm"] < 0:
            raise ValueError(f"negative precipitation on {cursor}")
        cursor += dt.timedelta(days=1)

    return daily


def end_of_month(year: int, month: int) -> dt.date:
    next_year = year + (month // 12)
    next_month = (month % 12) + 1
    return dt.date(next_year, next_month, 1) - dt.timedelta(days=1)


def crop_window(start_year: int, start_month: int, end_month: int) -> tuple[dt.date, dt.date]:
    """Inclusive month window. If end_month < start_month it crosses the year boundary."""
    end_year = start_year if end_month >= start_month else start_year + 1
    return dt.date(start_year, start_month, 1), end_of_month(end_year, end_month)


def iter_days(start: dt.date, end: dt.date) -> list[dt.date]:
    days = []
    cursor = start
    while cursor <= end:
        days.append(cursor)
        cursor += dt.timedelta(days=1)
    return days


def year_scenarios(daily: dict[dt.date, dict[str, float]]) -> dict[str, dict]:
    """Select the hottest and driest complete calendar years.

    Approved rule, START_HERE.md section 2: "Hottest: 2023 (mean Tmax 31.29 C);
    Driest: 2014 (total rain 59.76 mm); complete years only". That is a single
    calendar year, not a two-year window. The alternative two-year-window rule
    is kept in `two_year_window_table` as evidence for the Lead's cross-year
    decision, but it is NOT used for selection.
    """
    first_year = FIRST_DAY.year
    last_year = LAST_DAY.year

    rows = []
    for year in range(first_year, last_year + 1):
        days = [d for d in daily if d.year == year]
        if len(days) != 365 and len(days) != 366:
            raise ValueError(f"incomplete calendar year {year}: {len(days)} days")
        rows.append(
            {
                "year": year,
                "annual_mean_tmax_c": statistics.mean(
                    daily[d]["tmax_c"] for d in days
                ),
                "annual_rain_mm": round(sum(daily[d]["rain_mm"] for d in days), 2),
                "days_ge_35c": sum(
                    1 for d in days if daily[d]["tmax_c"] >= HEAT_THRESHOLD_C
                ),
                "summer_mean_tmax_c": statistics.mean(
                    daily[d]["tmax_c"] for d in days if 5 <= d.month <= 9
                ),
            }
        )

    hottest = max(
        rows,
        key=lambda r: (r["annual_mean_tmax_c"], r["days_ge_35c"], -r["year"]),
    )
    driest = min(
        rows,
        key=lambda r: (r["annual_rain_mm"], r["annual_mean_tmax_c"], r["year"]),
    )

    return {"rows": rows, "hottest": hottest, "driest": driest}


def two_year_window_table(daily: dict[dt.date, dict[str, float]]) -> list[dict]:
    """Evidence only: the same statistics pooled over two-year rotation windows.

    A four-slot rotation starting in year Y occupies Y/Y+1 and needs data to
    31 May Y+2, so 2014-2021 are the usable start years. Reported to let the
    Technical Lead decide the cross-year semantics; never used for selection.
    """
    rows = []
    for year in range(FIRST_DAY.year, LAST_DAY.year - 1):
        days = [d for d in daily if d.year in (year, year + 1)]
        rows.append(
            {
                "window_start_year": year,
                "two_year_mean_tmax_c": round(
                    statistics.mean(daily[d]["tmax_c"] for d in days), 2
                ),
                "two_year_rain_mm": round(sum(daily[d]["rain_mm"] for d in days), 2),
                "days_ge_35c": sum(
                    1 for d in days if daily[d]["tmax_c"] >= HEAT_THRESHOLD_C
                ),
                "summer_mean_tmax_c": round(
                    statistics.mean(
                        daily[d]["tmax_c"] for d in days if 5 <= d.month <= 9
                    ),
                    2,
                ),
            }
        )
    return rows


def worked_example(
    daily: dict[dt.date, dict[str, float]],
    sample: list[str],
    start_year: int,
) -> dict:
    """Independently reproduced water total and heat-day count for one rotation.

    This exists so the Comparison Engine can diff its own output against a
    number Research computed separately. It is a worked example, not the
    definition of the `average` scenario.
    """
    by_id = {crop["id"]: crop for crop in CROPS}
    slot_years = [start_year, start_year, start_year + 1, start_year + 1]

    per_slot = []
    covered: set[dt.date] = set()
    hot_sum = 0
    for slot, crop_id, year in zip(SLOT_ORDER, sample, slot_years):
        crop = by_id[crop_id]
        start, end = crop_window(
            year, crop["grow_window"]["start_month"], crop["grow_window"]["end_month"]
        )
        days = iter_days(start, end)
        covered.update(days)
        hot = sum(1 for d in days if daily[d]["tmax_c"] >= HEAT_THRESHOLD_C)
        hot_sum += hot
        per_slot.append(
            {
                "slot": slot,
                "crop_id": crop_id,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "days": len(days),
                "hot_days_ge_35c": hot,
            }
        )

    hot_union = sum(1 for d in covered if daily[d]["tmax_c"] >= HEAT_THRESHOLD_C)
    window_days = sum(row["days"] for row in per_slot)

    return {
        "rotation": sample,
        "window_start_year": start_year,
        "per_slot": per_slot,
        "window_days_summed_over_slots": window_days,
        "window_days_union": len(covered),
        "overlapping_window_days": window_days - len(covered),
        "hot_days_summed_over_slots": hot_sum,
        "hot_days_union": hot_union,
        "double_counted_hot_days": hot_sum - hot_union,
        "water_need_mm": {
            "sum_min": sum(by_id[c]["water_need_mm"]["min"] for c in sample),
            "sum_max": sum(by_id[c]["water_need_mm"]["max"] for c in sample),
        },
        "note": (
            "Heat days for a rotation are counted on the union of the four crop "
            "windows, so a day shared by a winter end month and the next summer "
            "start month is counted once. Summing the slots over-counts."
        ),
    }


def average_scenario_check(daily, sample: list[str]) -> dict:
    """Proposed definition of the `average` scenario for one rotation.

    Mean of the per-rotation heat totals over every complete window. The water
    range is scenario-independent, so it is identical to the worked example.
    """
    rows = []
    for start in range(FIRST_DAY.year, LAST_DAY.year - 1):
        example = worked_example(daily, sample, start)
        rows.append(
            {
                "window_start_year": start,
                "hot_days_union": example["hot_days_union"],
                "hot_days_summed_over_slots": example["hot_days_summed_over_slots"],
            }
        )
    unions = [row["hot_days_union"] for row in rows]
    return {
        "definition": (
            "Mean of the per-rotation union heat-day totals over the complete "
            "windows 2014-2021, reported with scenario_year = null. Proposed by "
            "Research; the Technical Lead confirms it as the shared definition."
        ),
        "rotation": sample,
        "windows": rows,
        "mean_union_hot_days": round(statistics.mean(unions), 2),
        "min_union_hot_days": min(unions),
        "max_union_hot_days": max(unions),
        "stdev_union_hot_days": round(statistics.stdev(unions), 2),
        "water_need_mm": worked_example(daily, sample, 2021)["water_need_mm"],
        "note": (
            "Year-to-year variation in this metric is small for this rotation "
            "(range 260-288 hot days, stdev 8.9). Present scenario differences "
            "as modest, not dramatic, and never imply a forecast."
        ),
    }


def build_climate_fixture(daily, scenarios, window_rows, retrieved_at: str) -> dict:
    return {
        "region_id": REGION_ID,
        "coordinates": {"lat": LAT, "lon": LON},
        "period": {"first_year": FIRST_DAY.year, "last_year": LAST_DAY.year},
        "units": {"tmax": "C", "rain": "mm/day"},
        "daily": [
            {
                "date": day.isoformat(),
                "tmax_c": daily[day]["tmax_c"],
                "rain_mm": daily[day]["rain_mm"],
            }
            for day in sorted(daily)
        ],
        "scenarios": {
            "hottest_year": {
                "year": scenarios["hottest"]["year"],
                "rule": (
                    "max annual mean daily T2M_MAX over the complete calendar "
                    "years 2014-2023; tie-break: more days >= 35.0 C, then "
                    "earlier year. Approved in START_HERE.md section 2."
                ),
            },
            "driest_year": {
                "year": scenarios["driest"]["year"],
                "rule": (
                    "min annual total PRECTOTCORR over the complete calendar "
                    "years 2014-2023; tie-break: lower annual mean T2M_MAX, then "
                    "earlier year. Approved in START_HERE.md section 2."
                ),
            },
        },
        "scenario_evidence": {
            "note": (
                "Optional, ignorable diagnostic block. The approved selection is a "
                "single calendar year. These are the per-year statistics behind it, "
                "plus the pooled two-year window table kept for the Lead's open "
                "cross-year decision. Do not use the window table to select a "
                "scenario without Lead approval."
            ),
            "calendar_years": scenarios["rows"],
            "two_year_windows": window_rows,
        },
        "provenance": {
            "source_url": SOURCE_URL,
            "retrieved_at": retrieved_at,
            "missing_days": 0,
            "spatial_resolution": (
                "MERRA-2 0.5 deg latitude x 0.625 deg longitude; POWER returns "
                "the grid cell containing the requested point (elevation 4.96 m)"
            ),
            "time_standard": "LST",
        },
        "fixture": True,
        "fixture_note": (
            "Development fixture built from a cached, unmodified NASA POWER "
            "response. Values ARE the retrieved NASA data, not synthetic, but "
            "this file is served as a fixture: do not label it as a live "
            "measurement or as current conditions. Not a forecast."
        ),
    }


def build_region_config(
    scenarios, window_rows, worked, avg_check, record_mean_tmax_c, retrieved_at: str
) -> dict:
    mean_annual_rain = round(
        statistics.mean(row["annual_rain_mm"] for row in scenarios["rows"]), 2
    )
    mean_annual_tmax = round(
        statistics.mean(row["annual_mean_tmax_c"] for row in scenarios["rows"]), 2
    )
    hottest = scenarios["hottest"]
    driest = scenarios["driest"]
    hot_window = max(
        window_rows,
        key=lambda r: (r["summer_mean_tmax_c"], r["days_ge_35c"], -r["window_start_year"]),
    )
    dry_window = min(
        window_rows,
        key=lambda r: (r["two_year_rain_mm"], r["summer_mean_tmax_c"], r["window_start_year"]),
    )
    return {
        "region_id": REGION_ID,
        "name": "Kafr El-Sheikh Governorate, Egypt",
        "name_ar": "كفر الشيخ",
        "country": "Egypt",
        "coordinates": {"lat": LAT, "lon": LON},
        "coordinate_basis": (
            "Representative point at Kafr El-Sheikh city (31.1107 N, 30.9388 E). "
            "The NASA POWER cell covers roughly 55 x 60 km, so it represents the "
            "central Delta, not any individual field."
        ),
        "elevation_m": 4.96,
        "slot_order": ["y1_summer", "y1_winter", "y2_summer", "y2_winter"],
        "priorities": ["water", "heat", "soil"],
        "scenarios": ["average", "hottest_year", "driest_year"],
        "heat_threshold_c": HEAT_THRESHOLD_C,
        "climate": {
            "provider": "NASA POWER",
            "endpoint": "api/temporal/daily/point",
            "community": "AG",
            "parameters": {
                "T2M_MAX": {"label": "Maximum temperature at 2 m", "unit": "C"},
                "PRECTOTCORR": {"label": "Corrected precipitation", "unit": "mm/day"},
            },
            "period": {"start": FIRST_DAY.isoformat(), "end": LAST_DAY.isoformat()},
            "complete_years": {
                "first": FIRST_DAY.year,
                "last": LAST_DAY.year,
                "count": LAST_DAY.year - FIRST_DAY.year + 1,
            },
            "retrieved_at": retrieved_at,
            "source_url": SOURCE_URL,
            "missing_days": 0,
            "spatial_resolution": "MERRA-2 0.5 deg x 0.625 deg (~55 x 60 km)",
            "time_standard": "LST",
            "observed_mean_daily_tmax_c": round(record_mean_tmax_c, 2),
            "observed_mean_annual_tmax_c": mean_annual_tmax,
            "observed_mean_annual_rain_mm": mean_annual_rain,
        },
        "scenario_selection": {
            "unit": "one complete calendar year (2014-2023)",
            "approved_in": "START_HERE.md section 2, Approved at T+3",
            "hottest_year": {
                "year": hottest["year"],
                "mean_tmax_c": round(hottest["annual_mean_tmax_c"], 2),
                "rule": (
                    "max annual mean daily T2M_MAX over the complete calendar "
                    "years 2014-2023; tie-break: more days >= 35.0 C, then "
                    "earlier year."
                ),
            },
            "driest_year": {
                "year": driest["year"],
                "total_rain_mm": driest["annual_rain_mm"],
                "rule": (
                    "min annual total PRECTOTCORR over the complete calendar "
                    "years 2014-2023; tie-break: lower annual mean T2M_MAX, then "
                    "earlier year."
                ),
            },
            "average": (
                "No single year: mean historical exposure across the baseline "
                "2014-2023, reported as scenario_year = null."
            ),
        },
        "rotation_window": {
            "rule": (
                "The four slots span two agricultural years: y1_summer and "
                "y1_winter fall in Y/Y+1, y2_summer and y2_winter in Y+1/Y+2, so "
                "a rotation starting in Y needs daily data to 31 May Y+2."
            ),
            "usable_start_years": [FIRST_DAY.year, LAST_DAY.year - 2],
            "note": (
                "Rotation-window coverage is a separate question from scenario "
                "selection: scenario years are single calendar years 2014-2023, "
                "rotation start years must be 2014-2021."
            ),
        },
        "cross_year_semantics": {
            "status": "open - requires Technical Lead approval",
            "owner": (
                "Technical Lead; START_HERE.md section 2 assigns cross-year "
                "semantics to the Lead"
            ),
            "question": (
                "A scenario names one calendar year, but a rotation covers two "
                "agricultural years. How is the scenario year mapped onto the "
                "four slots?"
            ),
            "constraint": (
                "Reading a winter slot forward from the reference year runs off "
                "the end of the record at the hot end: hottest_year 2023 has no "
                "November 2023 - May 2024 data, and driest_year 2014 has no "
                "October 2013 - May 2014 data."
            ),
            "options": [
                {
                    "id": "reference_year",
                    "description": (
                        "Read each slot's months from the scenario year. Where the "
                        "winter tail falls outside the record, that slot's "
                        "hot_days is null / Not evaluated with a meta.warnings "
                        "entry. Keeps the approved 2023/2014 selection; makes "
                        "part of the hottest scenario unevaluated."
                    ),
                },
                {
                    "id": "window_start_year",
                    "description": (
                        "Treat the scenario year as the first year of a two-year "
                        "window, so only 2014-2021 are usable. On the pooled "
                        "two-year statistics in scenario_evidence_two_year_windows "
                        f"that selects {hot_window['window_start_year']} as hottest "
                        f"(summer mean {hot_window['summer_mean_tmax_c']} C) and "
                        f"{dry_window['window_start_year']} as driest "
                        f"({dry_window['two_year_rain_mm']} mm over two years), "
                        "which would change the approved register values."
                    ),
                },
            ],
        },
        "scenario_evidence_two_year_windows": {
            "note": (
                "Optional, ignorable. Pooled two-year statistics kept as evidence "
                "for the open cross-year decision above. Not used for selection."
            ),
            "rows": window_rows,
        },
        "sample_baseline": SAMPLE_BASELINE,
        "worked_examples": {
            "note": (
                "Independently reproduced by Research from the cached series. "
                "The Comparison Engine should match these numbers exactly; a "
                "mismatch means one implementation is wrong. Optional and "
                "ignorable at runtime."
            ),
            "rotation_check": worked,
            "average_scenario_check": avg_check,
        },
        "sources": [s for s in SOURCES if s["id"].startswith("SRC-NASA")],
        "status": {
            "research_signoff": "approved",
            "research_signoff_date": "2026-11-13",
            "recorded_in_start_here_by_technical_lead": False,
            "note": (
                "Research approval covers scientific content (region, coordinates, "
                "period, parameters, heat threshold, scenario rule). The Technical "
                "Lead must record the approved values in START_HERE.md section 2 "
                "before they are treated as project-approved."
            ),
        },
    }


def build_crop_catalog() -> dict:
    return {
        "region_id": REGION_ID,
        "slot_order": ["y1_summer", "y1_winter", "y2_summer", "y2_winter"],
        "crops": CROPS,
        "sources": [
            {key: source[key] for key in ("id", "url", "supports")}
            for source in SOURCES
            if any(source["id"] in crop["source_ids"] for crop in CROPS)
        ],
        "catalog_version": "1.0.0",
        "water_need_unit": "mm per growing period (indicative crop water need, not applied irrigation)",
        "status": {
            "research_signoff": "approved",
            "research_signoff_date": "2026-11-13",
            "recorded_in_start_here_by_technical_lead": False,
        },
        "notes": [
            "Every water range is a total for one growing period, not a per-day rate.",
            "Ranges are indicative needs under optimal, disease-free conditions; they are not measured Egyptian irrigation withdrawals.",
            "grow_window months are inclusive approximations. When start_month > end_month the window crosses the calendar-year boundary (e.g. wheat 11 -> 5 means November of year Y to May of Y+1).",
            "Season validity is decided by valid_seasons. Overlapping month windows at a slot boundary (cotton into November, wheat into May) do not by themselves invalidate a rotation.",
            "is_legume supports qualitative diversity notes only. It is not a soil-health score.",
        ],
        "sources_for_soil_notes": ["SRC-FAO-SPECIES-DIVERSIFICATION"],
    }


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)

    retrieved_at = dt.datetime.fromtimestamp(
        RAW.stat().st_mtime, tz=dt.timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    daily = load_daily()
    scenarios = year_scenarios(daily)
    window_rows = two_year_window_table(daily)
    record_mean_tmax = statistics.mean(row["tmax_c"] for row in daily.values())

    # Regression guard: these values are Approved in START_HERE.md section 2.
    hottest = scenarios["hottest"]
    driest = scenarios["driest"]
    if hottest["year"] != 2023 or round(hottest["annual_mean_tmax_c"], 2) != 31.29:
        raise ValueError(
            f"hottest year drifted from the approved 2023 / 31.29 C: "
            f"{hottest['year']} / {hottest['annual_mean_tmax_c']:.2f}"
        )
    if driest["year"] != 2014 or driest["annual_rain_mm"] != 59.76:
        raise ValueError(
            f"driest year drifted from the approved 2014 / 59.76 mm: "
            f"{driest['year']} / {driest['annual_rain_mm']}"
        )

    worked = worked_example(daily, SAMPLE_BASELINE, 2021)
    avg_check = average_scenario_check(daily, SAMPLE_BASELINE)

    region = build_region_config(
        scenarios, window_rows, worked, avg_check, record_mean_tmax, retrieved_at
    )
    climate = build_climate_fixture(daily, scenarios, window_rows, retrieved_at)
    catalog = build_crop_catalog()

    outputs = [
        (PROCESSED / "region_config.json", region),
        (PROCESSED / "crop_catalog.json", catalog),
        (FIXTURES / "mock_climate_response.json", climate),
        (FIXTURES / "mock_crop_catalog.json", {**catalog, "fixture": True}),
    ]
    for path, payload in outputs:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    # ---------------- verification report ----------------
    print(f"days                : {len(daily)}")
    print(f"period              : {min(daily)} .. {max(daily)}")
    print(f"missing / fill days : 0")
    print(f"retrieved_at        : {retrieved_at}")
    print()
    print("year | annual mean T2M_MAX | annual rain | days>=35 | summer mean")
    for row in scenarios["rows"]:
        print(
            f"  {row['year']}        |"
            f" {row['annual_mean_tmax_c']:>8.2f} C         |"
            f" {row['annual_rain_mm']:>7.2f} mm | {row['days_ge_35c']:>6}   |"
            f" {row['summer_mean_tmax_c']:>6.2f} C"
        )
    print()
    print(
        "hottest year (approved) :", hottest["year"],
        f"(annual mean {hottest['annual_mean_tmax_c']:.2f} C)",
    )
    print(
        "driest  year (approved) :", driest["year"],
        f"(annual rain {driest['annual_rain_mm']:.2f} mm)",
    )
    print()
    print("evidence only - pooled two-year windows (start with year Y):")
    print("  start | 2y mean | 2y rain | days>=35 | summer mean")
    for row in window_rows:
        print(
            f"    {row['window_start_year']}   |"
            f" {row['two_year_mean_tmax_c']:>6.2f} C |"
            f" {row['two_year_rain_mm']:>7.2f} | {row['days_ge_35c']:>6}   |"
            f" {row['summer_mean_tmax_c']:>6.2f} C"
        )
    print(
        "  -> cross-year semantics OPEN for the Lead: reference_year keeps "
        "2023/2014, window_start_year would move to 2021/2018"
    )

    # independent verification example: one rotation, one window
    print()
    print(
        f"verification rotation {worked['rotation']} "
        f"in window {worked['window_start_year']}"
    )
    for row in worked["per_slot"]:
        print(
            f"  {row['slot']:<10} {row['crop_id']:<9}"
            f" {row['start_date']} .. {row['end_date']}"
            f"  days={row['days']:>3}  hot>=35={row['hot_days_ge_35c']:>3}"
        )
    print(
        f"  window days summed over slots = "
        f"{worked['window_days_summed_over_slots']}, union = "
        f"{worked['window_days_union']} "
        f"(overlap {worked['overlapping_window_days']})"
    )
    print(
        f"  hot days summed over slots = "
        f"{worked['hot_days_summed_over_slots']}, union (deduplicated) = "
        f"{worked['hot_days_union']} "
        f"(double counted {worked['double_counted_hot_days']})"
    )
    print(
        f"  water_need_mm total = {worked['water_need_mm']['sum_min']} .. "
        f"{worked['water_need_mm']['sum_max']} mm / 2 years"
    )
    print()
    print("wrote:")
    for path, _ in outputs:
        print(f"  {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
