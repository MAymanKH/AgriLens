"""
AgriLens - Climate Data Acquisition and Processing Script
Fetches daily NASA POWER meteorological data for Kafr El-Sheikh, Egypt (2014-2023),
validates completeness, calculates historical scenarios (hottest and driest years),
and writes raw, processed, and fixture JSON files.
"""

import urllib.request
import json
import datetime
from pathlib import Path

LATITUDE = 31.1107
LONGITUDE = 30.9388
REGION_ID = "kafr_el_sheikh"
REGION_NAME = "Kafr El-Sheikh, Egypt (Nile Delta)"
START_DATE = "20140101"
END_DATE = "20231231"
START_YEAR = 2014
END_YEAR = 2023

URL = (
    f"https://power.larc.nasa.gov/api/temporal/daily/point"
    f"?parameters=T2M_MAX,PRECTOTCORR"
    f"&community=AG"
    f"&longitude={LONGITUDE}"
    f"&latitude={LATITUDE}"
    f"&start={START_DATE}"
    f"&end={END_DATE}"
    f"&format=JSON"
)

RAW_OUT_PATH = Path("data/raw/nasa_power_kafr_el_sheikh_2014_2023.json")
PROCESSED_OUT_PATH = Path("data/processed/climate_daily_clean.json")
FIXTURE_OUT_PATH = Path("data/fixtures/mock_climate_response.json")

def fetch_data():
    print(f"Requesting NASA POWER API: {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "AgriLens-SpaceApps/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        content = resp.read().decode("utf-8")
        data = json.loads(content)
    
    # Save raw
    RAW_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RAW_OUT_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved raw NASA POWER response to {RAW_OUT_PATH}")
    return data

def process_data(raw_data):
    params = raw_data.get("properties", {}).get("parameter", {})
    tmax_dict = params.get("T2M_MAX", {})
    rain_dict = params.get("PRECTOTCORR", {})

    daily_list = []
    missing_days = 0

    # Year-by-year accumulation
    yearly_stats = {}
    for y in range(START_YEAR, END_YEAR + 1):
        yearly_stats[y] = {
            "tmax_sum": 0.0,
            "rain_sum": 0.0,
            "days_count": 0,
            "missing_count": 0
        }

    # Generate expected date sequence
    curr = datetime.date(START_YEAR, 1, 1)
    end = datetime.date(END_YEAR, 12, 31)
    one_day = datetime.timedelta(days=1)

    while curr <= end:
        date_key = curr.strftime("%Y%m%d")
        iso_date = curr.strftime("%Y-%m-%d")
        y = curr.year

        tmax_val = tmax_dict.get(date_key)
        rain_val = rain_dict.get(date_key)

        # NASA invalid indicator is typically -999 or None
        is_missing = False
        if tmax_val is None or tmax_val <= -900:
            tmax_val = None
            is_missing = True
        if rain_val is None or rain_val < 0 or rain_val <= -900:
            rain_val = None
            is_missing = True

        if is_missing:
            missing_days += 1
            yearly_stats[y]["missing_count"] += 1
        else:
            yearly_stats[y]["tmax_sum"] += tmax_val
            yearly_stats[y]["rain_sum"] += rain_val
            yearly_stats[y]["days_count"] += 1

        daily_list.append({
            "date": iso_date,
            "tmax_c": round(tmax_val, 2) if tmax_val is not None else None,
            "rain_mm": round(rain_val, 2) if rain_val is not None else None
        })

        curr += one_day

    # Scenario calculations
    complete_years = []
    for y, stats in yearly_stats.items():
        expected_days = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
        if stats["days_count"] == expected_days and stats["missing_count"] == 0:
            avg_tmax = stats["tmax_sum"] / stats["days_count"]
            tot_rain = stats["rain_sum"]
            complete_years.append({
                "year": y,
                "avg_tmax": avg_tmax,
                "total_rain": tot_rain
            })
            print(f"Year {y}: Mean Tmax = {avg_tmax:.2f}°C, Total Rain = {tot_rain:.2f} mm (Complete)")
        else:
            print(f"Year {y}: Incomplete ({stats['days_count']}/{expected_days} valid days, {stats['missing_count']} missing)")

    if not complete_years:
        raise ValueError("No complete years found in the requested range!")

    hottest = max(complete_years, key=lambda x: x["avg_tmax"])
    driest = min(complete_years, key=lambda x: x["total_rain"])

    retrieved_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    climate_payload = {
        "region_id": REGION_ID,
        "region_name": REGION_NAME,
        "coordinates": {"lat": LATITUDE, "lon": LONGITUDE},
        "period": {"first_year": START_YEAR, "last_year": END_YEAR},
        "units": {"tmax": "C", "rain": "mm/day"},
        "scenarios": {
            "hottest_year": {
                "year": hottest["year"],
                "rule": "max annual mean daily maximum temp among complete years",
                "annual_mean_tmax_c": round(hottest["avg_tmax"], 2)
            },
            "driest_year": {
                "year": driest["year"],
                "rule": "min annual total precipitation among complete years",
                "annual_total_rain_mm": round(driest["total_rain"], 2)
            }
        },
        "provenance": {
            "source_url": URL,
            "retrieved_at": retrieved_at,
            "missing_days": missing_days,
            "spatial_resolution": "0.5 x 0.625 degree (MERRA-2 / GEOS-FP)",
            "time_standard": "UTC"
        },
        "daily": daily_list
    }

    PROCESSED_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROCESSED_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(climate_payload, f, indent=2)
    print(f"Saved processed dataset to {PROCESSED_OUT_PATH}")

    # Generate a lightweight fixture (first 60 days + scenarios & provenance)
    fixture_payload = dict(climate_payload)
    fixture_payload["daily"] = daily_list[:60]
    with open(FIXTURE_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fixture_payload, f, indent=2)
    print(f"Saved lightweight fixture to {FIXTURE_OUT_PATH}")

    return climate_payload

if __name__ == "__main__":
    raw = fetch_data()
    process_data(raw)
