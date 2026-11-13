"""
AgriLens - NASA Earthdata CMR Direct Catalog Verification Script
Queries NASA CMR Search API for HLS L30, S30, ECOSTRESS LST, ET, and ESI
granules and unique dates at the Zankalon Water Research Station (30.58057 N, 31.43332 E)
across the FAO Egypt crop mapping window (2023-05-15 through 2024-10-15).
"""

import urllib.request
import json
from collections import defaultdict

POINT_LON = 31.43332
POINT_LAT = 30.58057
START_TIME = "2023-05-15T00:00:00Z"
END_TIME = "2024-10-15T23:59:59Z"

COLLECTIONS = {
    "HLS Landsat L30 v2.0": "C2021957657-LPCLOUD",
    "HLS Sentinel S30 v2.0": "C2021957295-LPCLOUD",
    "ECOSTRESS v2 LST": "C2076090826-LPCLOUD",
    "ECOSTRESS v2 ET (PT-JPL)": "C2076106409-LPCLOUD",
    "ECOSTRESS v2 ESI": "C2076104650-LPCLOUD"
}

def verify_cmr():
    print(f"Querying NASA CMR Search API for Zankalon ({POINT_LAT} N, {POINT_LON} E)...")
    print(f"Temporal Window: {START_TIME} to {END_TIME}\n")
    print(f"{'Collection':<28} | {'Concept ID':<22} | {'Total Granules':<15} | {'Unique Dates'}")
    print("-" * 80)

    results = {}
    for name, concept_id in COLLECTIONS.items():
        url = (
            f"https://cmr.earthdata.nasa.gov/search/granules.json"
            f"?collection_concept_id={concept_id}"
            f"&point={POINT_LON},{POINT_LAT}"
            f"&temporal={START_TIME},{END_TIME}"
            f"&page_size=200"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "AgriLens-SpaceApps/2.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        entries = data.get("feed", {}).get("entry", [])
        unique_dates = set(e["time_start"][:10] for e in entries)
        results[name] = {
            "concept_id": concept_id,
            "granules": len(entries),
            "unique_dates": len(unique_dates)
        }
        print(f"{name:<28} | {concept_id:<22} | {len(entries):<15} | {len(unique_dates)}")

    return results

if __name__ == "__main__":
    verify_cmr()
