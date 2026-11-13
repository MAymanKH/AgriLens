"""
AgriLens - Zankalon NASA POWER Ingestion & FAO-56 Penman-Monteith ET0 Calculation
Fetches 10 years of daily NASA POWER meteorological observations (2016-2025)
for the Zankalon Water Research Station, Sharkia Governorate (30.58057 N, 31.43332 E).
Calculates FAO-56 Penman-Monteith reference evapotranspiration (ET0) from daily shortwave
solar radiation, Tmax, Tmin, relative humidity, and 2m wind speed.
"""

import urllib.request
import json
import math
import datetime
from pathlib import Path

LATITUDE = 30.58057
LONGITUDE = 31.43332
ELEVATION_M = 10.0  # meters above sea level
REGION_ID = "zankalon_sharkia"
REGION_NAME = "Zankalon, Sharkia Governorate, Egypt (East Nile Delta)"
START_DATE = "20160101"
END_DATE = "20251231"
START_YEAR = 2016
END_YEAR = 2025

PARAMETERS = "T2M_MAX,T2M_MIN,RH2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,WS2M"

URL = (
    f"https://power.larc.nasa.gov/api/temporal/daily/point"
    f"?parameters={PARAMETERS}"
    f"&community=AG"
    f"&longitude={LONGITUDE}"
    f"&latitude={LATITUDE}"
    f"&start={START_DATE}"
    f"&end={END_DATE}"
    f"&format=JSON"
)

RAW_OUT_PATH = Path("data/raw/nasa_power_zankalon_2016_2025.json")

def fao56_penman_monteith(tmax, tmin, rh, rs, ws, doy, lat_deg, elev_m):
    """
    Computes daily FAO-56 Penman-Monteith Reference Evapotranspiration (ET0 in mm/day).
    tmax, tmin: deg C
    rh: mean relative humidity (%)
    rs: incoming solar radiation (MJ/m^2/day)
    ws: wind speed at 2m (m/s)
    doy: day of year (1-366)
    lat_deg: latitude in decimal degrees
    elev_m: elevation above sea level in meters
    """
    tmean = (tmax + tmin) / 2.0

    # Atmospheric pressure (kPa)
    p = 101.3 * math.pow((293.0 - 0.0065 * elev_m) / 293.0, 5.26)
    
    # Psychrometric constant (kPa / deg C)
    gamma = 0.000665 * p

    # Slope of saturation vapour pressure curve (kPa / deg C)
    delta = (4098.0 * (0.6108 * math.exp((17.27 * tmean) / (tmean + 237.3)))) / math.pow(tmean + 237.3, 2)

    # Saturation vapour pressure (kPa)
    e0_tmax = 0.6108 * math.exp((17.27 * tmax) / (tmax + 237.3))
    e0_tmin = 0.6108 * math.exp((17.27 * tmin) / (tmin + 237.3))
    es = (e0_tmax + e0_tmin) / 2.0

    # Actual vapour pressure (kPa)
    ea = es * (rh / 100.0)

    # Extraterrestrial radiation Ra (MJ/m^2/day)
    phi = math.radians(lat_deg)
    dr = 1.0 + 0.033 * math.cos(2.0 * math.pi * doy / 365.0)
    delta_sol = 0.409 * math.sin((2.0 * math.pi * doy / 365.0) - 1.39)
    
    arg = -math.tan(phi) * math.tan(delta_sol)
    arg = max(-1.0, min(1.0, arg))
    omega_s = math.acos(arg)

    gsc = 0.0820  # MJ / m^2 / min
    ra = ((24.0 * 60.0) / math.pi) * gsc * dr * (
        omega_s * math.sin(phi) * math.sin(delta_sol) +
        math.cos(phi) * math.cos(delta_sol) * math.sin(omega_s)
    )

    # Clear-sky solar radiation Rso (MJ/m^2/day)
    rso = (0.75 + 2e-5 * elev_m) * ra

    # Net shortwave radiation Rns (MJ/m^2/day), albedo = 0.23
    rns = (1.0 - 0.23) * rs

    # Net longwave radiation Rnl (MJ/m^2/day)
    sigma = 4.903e-9  # MJ / K^4 / m^2 / day
    tmax_k4 = math.pow(tmax + 273.16, 4)
    tmin_k4 = math.pow(tmin + 273.16, 4)
    
    # Relative solar radiation index
    rs_rso = rs / rso if rso > 0 else 0.5
    rs_rso = max(0.3, min(1.0, rs_rso))

    rnl = sigma * ((tmax_k4 + tmin_k4) / 2.0) * (0.34 - 0.14 * math.sqrt(max(0.0, ea))) * (1.35 * rs_rso - 0.35)

    # Net radiation Rn (MJ/m^2/day)
    rn = rns - rnl
    rn = max(0.0, rn)  # prevent negative during daylight calculations

    # Soil heat flux G is ~ 0 for daily time steps
    g = 0.0

    # Penman-Monteith equation
    numerator = 0.408 * delta * (rn - g) + gamma * (900.0 / (tmean + 273.0)) * ws * (es - ea)
    denominator = delta + gamma * (1.0 + 0.34 * ws)
    
    et0 = numerator / denominator
    return max(0.0, et0)

def fetch_data():
    print(f"Requesting NASA POWER API for Zankalon: {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "AgriLens-SpaceApps/2.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        content = resp.read().decode("utf-8")
        data = json.loads(content)
    
    RAW_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RAW_OUT_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved raw NASA POWER response to {RAW_OUT_PATH}")
    return data

def process_zankalon(raw_data, retrieved_at):
    params = raw_data.get("properties", {}).get("parameter", {})
    tmax_dict = params.get("T2M_MAX", {})
    tmin_dict = params.get("T2M_MIN", {})
    rh_dict = params.get("RH2M", {})
    rain_dict = params.get("PRECTOTCORR", {})
    sw_dict = params.get("ALLSKY_SFC_SW_DWN", {})
    ws_dict = params.get("WS2M", {})

    daily_list = []
    missing_days = 0

    yearly_stats = {}
    for y in range(START_YEAR, END_YEAR + 1):
        yearly_stats[y] = {
            "tmax_sum": 0.0,
            "rain_sum": 0.0,
            "et0_sum": 0.0,
            "hot_days_35": 0,
            "hot_days_38": 0,
            "days_count": 0,
            "missing_count": 0
        }

    curr = datetime.date(START_YEAR, 1, 1)
    end = datetime.date(END_YEAR, 12, 31)
    one_day = datetime.timedelta(days=1)

    while curr <= end:
        date_key = curr.strftime("%Y%m%d")
        iso_date = curr.strftime("%Y-%m-%d")
        y = curr.year
        doy = curr.timetuple().tm_yday

        tmax = tmax_dict.get(date_key)
        tmin = tmin_dict.get(date_key)
        rh = rh_dict.get(date_key)
        rain = rain_dict.get(date_key)
        sw = sw_dict.get(date_key)
        ws = ws_dict.get(date_key)

        is_missing = False
        vals = [tmax, tmin, rh, rain, sw, ws]
        if any(v is None or v <= -900 for v in vals):
            is_missing = True

        if is_missing:
            missing_days += 1
            yearly_stats[y]["missing_count"] += 1
            et0_val = None
        else:
            et0_val = fao56_penman_monteith(tmax, tmin, rh, sw, ws, doy, LATITUDE, ELEVATION_M)
            yearly_stats[y]["tmax_sum"] += tmax
            yearly_stats[y]["rain_sum"] += rain
            yearly_stats[y]["et0_sum"] += et0_val
            yearly_stats[y]["days_count"] += 1
            if tmax >= 35.0:
                yearly_stats[y]["hot_days_35"] += 1
            if tmax >= 38.0:
                yearly_stats[y]["hot_days_38"] += 1

        daily_list.append({
            "date": iso_date,
            "tmax_c": round(tmax, 2) if tmax is not None and tmax > -900 else None,
            "tmin_c": round(tmin, 2) if tmin is not None and tmin > -900 else None,
            "rh_pct": round(rh, 1) if rh is not None and rh > -900 else None,
            "rain_mm": round(rain, 2) if rain is not None and rain >= 0 else None,
            "solar_radiation_mj_m2": round(sw, 2) if sw is not None and sw >= 0 else None,
            "wind_speed_2m_ms": round(ws, 2) if ws is not None and ws >= 0 else None,
            "et0_fao56_mm": round(et0_val, 2) if et0_val is not None else None
        })

        curr += one_day

    complete_years = []
    for y, stats in yearly_stats.items():
        expected_days = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
        if stats["days_count"] == expected_days and stats["missing_count"] == 0:
            avg_tmax = stats["tmax_sum"] / stats["days_count"]
            tot_rain = stats["rain_sum"]
            tot_et0 = stats["et0_sum"]
            complete_years.append({
                "year": y,
                "avg_tmax": avg_tmax,
                "total_rain": tot_rain,
                "total_et0": tot_et0,
                "hot_days_35": stats["hot_days_35"],
                "hot_days_38": stats["hot_days_38"]
            })
            print(f"Year {y}: Mean Tmax={avg_tmax:.2f}°C, Rain={tot_rain:.1f}mm, ET0={tot_et0:.1f}mm, Days>=35C={stats['hot_days_35']}, Days>=38C={stats['hot_days_38']}")

    hottest = max(complete_years, key=lambda x: x["avg_tmax"])
    driest = min(complete_years, key=lambda x: x["total_rain"])
    highest_et0 = max(complete_years, key=lambda x: x["total_et0"])

    climate_payload = {
        "region_id": REGION_ID,
        "region_name": REGION_NAME,
        "coordinates": {"lat": LATITUDE, "lon": LONGITUDE},
        "elevation_m": ELEVATION_M,
        "period": {"first_year": START_YEAR, "last_year": END_YEAR},
        "units": {
            "tmax": "C",
            "tmin": "C",
            "rh": "%",
            "rain": "mm/day",
            "solar_radiation": "MJ/m^2/day",
            "wind_speed": "m/s",
            "et0_fao56": "mm/day"
        },
        "scenarios": {
            "hottest_year": {
                "year": hottest["year"],
                "rule": "max annual mean daily maximum temp among complete years",
                "annual_mean_tmax_c": round(hottest["avg_tmax"], 2),
                "hot_days_gte_35c": hottest["hot_days_35"],
                "hot_days_gte_38c": hottest["hot_days_38"]
            },
            "driest_year": {
                "year": driest["year"],
                "rule": "min annual total precipitation among complete years",
                "annual_total_rain_mm": round(driest["total_rain"], 2),
                "annual_total_et0_mm": round(driest["total_et0"], 1)
            },
            "highest_demand_year": {
                "year": highest_et0["year"],
                "rule": "max annual cumulative FAO-56 Penman-Monteith reference ET (ET0)",
                "annual_total_et0_mm": round(highest_et0["total_et0"], 1)
            }
        },
        "provenance": {
            "source_url": URL,
            "retrieved_at": retrieved_at,
            "missing_days": missing_days,
            "total_days": len(daily_list),
            "spatial_resolution": "0.5 x 0.625 degree (MERRA-2 / GEOS-FP)",
            "time_standard": raw_data["header"]["time_standard"],
            "et0_method": "FAO-56 Penman-Monteith equation (Allen et al., 1998)"
        },
        "daily": daily_list
    }

    return climate_payload

if __name__ == "__main__":
    raw = fetch_data()
    print("Raw response saved. Rebuild staging files with:")
    print("python scripts/build_research_data.py --retrieved-at " + datetime.datetime.now(datetime.timezone.utc).isoformat())
