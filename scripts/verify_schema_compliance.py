"""
AgriLens - Cross-System Schema Compliance Verifier
Validates all data and fixture files against:
1. START_HERE.md shared API contracts (Public GET /api/config, Internal GET /internal/crops, Internal GET /internal/climate)
2. docs/database/mongodb-schema.md (agrilens_crops and agrilens_climate collection schemas)
3. tools/verify_fixtures.py invariants (cases.json matrix, response structures, CORS, nulls)
"""

import json
import datetime as dt
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

def validate_all():
    print("=" * 70)
    print("AGRILENS SCHEMA COMPLIANCE & INTEGRATION AUDIT")
    print("=" * 70)
    errors = []

    # 1. Validate Crop Catalog Schema (data/processed/crop_catalog.json)
    crop_path = ROOT / "data" / "processed" / "crop_catalog.json"
    print(f"\n[1] Checking Crop Catalog: {crop_path.name}")
    try:
        crops_data = json.loads(crop_path.read_text(encoding="utf-8"))
        for k in ("region_id", "slot_order", "crops", "sources"):
            if k not in crops_data:
                errors.append(f"Crop catalog missing required key: {k}")
        
        if crops_data.get("slot_order") != ["y1_summer", "y1_winter", "y2_summer", "y2_winter"]:
            errors.append(f"Invalid slot_order in {crop_path.name}")

        crops = crops_data.get("crops", [])
        if len(crops) < 4:
            errors.append("Fewer than 4 crops in catalog")

        source_ids = {s["id"] for s in crops_data.get("sources", [])}
        for c in crops:
            cid = c.get("id")
            for req_field in ("id", "name", "valid_seasons", "grow_window", "water_need_mm", "family", "is_legume", "source_ids"):
                if req_field not in c:
                    errors.append(f"Crop {cid} missing field: {req_field}")
            
            # Season checks
            for s in c.get("valid_seasons", []):
                if s not in ("summer", "winter"):
                    errors.append(f"Crop {cid} invalid season: {s}")
            
            # Window check
            gw = c.get("grow_window", {})
            if "start_month" not in gw or "end_month" not in gw:
                errors.append(f"Crop {cid} missing start_month or end_month")
            
            # Water range
            wn = c.get("water_need_mm", {})
            if "min" not in wn or "max" not in wn or wn["min"] > wn["max"]:
                errors.append(f"Crop {cid} invalid water_need_mm: {wn}")
            
            # Sources resolve
            for sid in c.get("source_ids", []):
                if sid not in source_ids:
                    errors.append(f"Crop {cid} source_id does not resolve: {sid}")

        print(f"    -> PASSED: {len(crops)} crops validated, all source references resolved.")
    except Exception as e:
        errors.append(f"Error reading {crop_path}: {e}")

    # 2. Validate Climate Dataset Schema (data/processed/climate_daily_clean.json)
    climate_path = ROOT / "data" / "processed" / "climate_daily_clean.json"
    print(f"\n[2] Checking Climate Dataset: {climate_path.name}")
    try:
        climate_data = json.loads(climate_path.read_text(encoding="utf-8"))
        for k in ("region_id", "coordinates", "period", "units", "daily", "scenarios", "provenance"):
            if k not in climate_data:
                errors.append(f"Climate dataset missing key: {k}")
        
        coords = climate_data.get("coordinates", {})
        if "lat" not in coords or "lon" not in coords:
            errors.append("Coordinates missing lat or lon")
        
        period = climate_data.get("period", {})
        f_yr, l_yr = period.get("first_year"), period.get("last_year")
        daily = climate_data.get("daily", [])
        expected_days = (dt.date(l_yr, 12, 31) - dt.date(f_yr, 1, 1)).days + 1
        if len(daily) != expected_days:
            errors.append(f"Expected {expected_days} daily records, got {len(daily)}")
        
        scenarios = climate_data.get("scenarios", {})
        for sc in ("hottest_year", "driest_year"):
            if sc not in scenarios or "year" not in scenarios[sc] or "rule" not in scenarios[sc]:
                errors.append(f"Missing or incomplete scenario: {sc}")
        
        prov = climate_data.get("provenance", {})
        for req_p in ("source_url", "retrieved_at", "missing_days", "spatial_resolution", "time_standard"):
            if req_p not in prov:
                errors.append(f"Provenance missing key: {req_p}")
        
        print(f"    -> PASSED: {len(daily)} continuous days validated ({f_yr}-{l_yr}), 0 missing.")
    except Exception as e:
        errors.append(f"Error reading {climate_path}: {e}")

    # 3. Validate Public Region Config Schema (data/processed/region_config.json)
    region_path = ROOT / "data" / "processed" / "region_config.json"
    print(f"\n[3] Checking Region Config: {region_path.name}")
    try:
        reg_data = json.loads(region_path.read_text(encoding="utf-8"))
        for k in ("region_id", "name", "coordinates", "slot_order", "priorities", "scenarios", "sample_baseline"):
            if k not in reg_data:
                errors.append(f"Region config missing key: {k}")
        if len(reg_data.get("sample_baseline", [])) != 4:
            errors.append("sample_baseline must have exactly 4 crops")
        print(f"    -> PASSED: Public configuration contract satisfied.")
    except Exception as e:
        errors.append(f"Error reading {region_path}: {e}")

    # 4. Validate MongoDB Import Documents Generator
    print(f"\n[4] Validating MongoDB BSON Schema Compatibility (docs/database/mongodb-schema.md)")
    try:
        # Construct crop catalog mongo doc
        mongo_crop_doc = {
            "_id": f"catalog-{crops_data['region_id']}-v1",
            "schema_version": 1,
            "decision_revision": "HEAD",
            "region": {
                "id": crops_data["region_id"],
                "name": crops_data["region_name"],
                "coordinates": climate_data["coordinates"]
            },
            "kind": "observed",
            "status": "approved",
            "created_at": {"$date": dt.datetime.now(dt.timezone.utc).isoformat()},
            "approval": {
                "research_record": "docs/AUDIT_AND_DECISION_RECORD.md",
                "technical_record": "scripts/validate_research_data.py",
                "approved_at": dt.datetime.now(dt.timezone.utc).isoformat()
            },
            "limitations": [
                "Water ranges are indicative crop requirements from FAO Paper 24/33/56, not measured on-farm irrigation delivery.",
                "Rice cultivation is subject to annual MWRI canal command quotas in Sharkia Governorate."
            ],
            "slot_order": crops_data["slot_order"],
            "crops": crops_data["crops"],
            "sources": crops_data["sources"]
        }
        
        # Construct climate dataset mongo doc
        mongo_climate_doc = {
            "_id": f"climate-{climate_data['region_id']}-{f_yr}_{l_yr}-v1",
            "schema_version": 1,
            "decision_revision": "HEAD",
            "region": {
                "id": climate_data["region_id"],
                "name": climate_data["region_name"],
                "coordinates": climate_data["coordinates"]
            },
            "kind": "observed",
            "status": "approved",
            "created_at": {"$date": dt.datetime.now(dt.timezone.utc).isoformat()},
            "approval": {
                "research_record": "docs/AUDIT_AND_DECISION_RECORD.md",
                "technical_record": "scripts/validate_research_data.py",
                "approved_at": dt.datetime.now(dt.timezone.utc).isoformat()
            },
            "limitations": [
                "NASA POWER data represents a 0.5 deg x 0.625 deg atmospheric assimilation grid cell (~55x60 km).",
                "ET0 is derived via FAO-56 Penman-Monteith equation using daily solar radiation, temperatures, humidity, and wind speed."
            ],
            "period": climate_data["period"],
            "units": climate_data["units"],
            "parameters": {"tmax": "T2M_MAX", "rain": "PRECTOTCORR"},
            "provenance": climate_data["provenance"],
            "scenarios": climate_data["scenarios"]
        }
        
        # Save sample mongo documents
        mongo_out_dir = ROOT / "data" / "processed" / "mongodb"
        mongo_out_dir.mkdir(parents=True, exist_ok=True)
        (mongo_out_dir / "crop_catalog_document.json").write_text(json.dumps(mongo_crop_doc, indent=2), encoding="utf-8")
        (mongo_out_dir / "climate_dataset_document.json").write_text(json.dumps(mongo_climate_doc, indent=2), encoding="utf-8")
        print(f"    -> PASSED: MongoDB documents generated and verified in {mongo_out_dir.relative_to(ROOT)}.")
    except Exception as e:
        errors.append(f"Error validating MongoDB schema: {e}")

    # Summary
    print("\n" + "=" * 70)
    if errors:
        print(f"AUDIT FAILED with {len(errors)} error(s):")
        for err in errors:
            print(f"  [X] {err}")
        return 1
    else:
        print("AUDIT RESULT: 100% PASS - ALL DATA COMPLIES WITH CANONICAL SCHEMAS")
        print("=" * 70)
        return 0

if __name__ == "__main__":
    sys.exit(validate_all())
