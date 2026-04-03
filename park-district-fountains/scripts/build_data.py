#!/usr/bin/env python3
"""
Step 2: Merge geocoded parks + fountains into data/build/fountains.json.
Run after geocode_parks.py.
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).parent.parent
PARKS_CSV = BASE_DIR / "data/processed/parks_geocoded.csv"
FOUNTAINS_CSV = BASE_DIR / "data/processed/fountains.csv"
OUTPUT_JSON = BASE_DIR / "data/build/fountains.json"

# Truly offline — no result shown
OFFLINE_STATUSES = {"OFF", "REMOVED", "DOES NOT EXIST"}
# Active but under remediation — still evaluate by ppb if result exists
REMEDIATION_STATUSES = {"CONT"}


def safety_level(row):
    """Determine safety level for an individual fountain row."""
    status = str(row.get("status", "")).strip().upper()
    if status in OFFLINE_STATUSES or status == "NAN":
        return "unknown"
    ppb = row.get("latest_result_ppb")
    if ppb is None or (isinstance(ppb, float) and math.isnan(ppb)):
        return "unknown"
    ppb = float(ppb)
    if ppb < 5:
        return "safe"
    elif ppb <= 15:
        return "caution"
    else:
        return "danger"


def recommendation(level, ppb, status, remediation_plan, remediated):
    """Human-readable recommendation string."""
    in_remediation = str(status).strip().upper() in REMEDIATION_STATUSES
    remediation_note = ""
    if in_remediation and remediation_plan:
        done = bool(remediated)
        remediation_note = f" Remediation {'complete' if done else 'in progress'}: {remediation_plan}."

    if level == "safe":
        return f"Safe to drink \u2014 last result: {ppb} ppb.{remediation_note}"
    elif level == "caution":
        return f"Use caution \u2014 last result: {ppb} ppb (near EPA limit of 15 ppb).{remediation_note}"
    elif level == "danger":
        return f"Do not drink \u2014 last result: {ppb} ppb (above EPA action level).{remediation_note}"
    else:
        if in_remediation:
            plan = f": {remediation_plan}" if remediation_plan else ""
            return f"Fountain under remediation{plan} \u2014 no test result available."
        return "Fountain is offline or removed."


SAFETY_RANK = {"danger": 3, "caution": 2, "unknown": 1, "safe": 0}


def park_safety(fountain_levels):
    """Park-level safety = worst of its ON fountains."""
    if not fountain_levels:
        return "unknown"
    return max(fountain_levels, key=lambda lvl: SAFETY_RANK[lvl])


def nan_to_none(val):
    if isinstance(val, float) and math.isnan(val):
        return None
    return val


def str_or_none(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).strip()
    return s if s else None


def build_fountain(row):
    level = safety_level(row)
    ppb = nan_to_none(row.get("latest_result_ppb"))
    ppb_display = round(float(ppb), 1) if ppb is not None else None
    max_ppb = nan_to_none(row.get("max_lead_ever_ppb"))
    status = str(row.get("status", "")).strip()
    remediation_plan = str_or_none(row.get("remediation_plan"))
    remediated = bool(row.get("remediated", False))
    tested_2025 = bool(row.get("tested_2025", False))

    return {
        "fountain_id": str(row["fountain_id"]),
        "location": str(row.get("location", "")),
        "location_description": str_or_none(row.get("location_description")),
        "type": str(row.get("type", "")),
        "is_bottle_filler": bool(row.get("is_bottle_filler", False)),
        "status": status,
        "latest_result_ppb": ppb_display,
        "tested_2025": tested_2025,
        "ever_elevated": bool(row.get("ever_elevated", False)),
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "remediation_plan": remediation_plan,
        "remediated": remediated,
        "safety_level": level,
        "recommendation": recommendation(level, ppb_display, status, remediation_plan, remediated),
    }


def build_park(park_row, fountains_for_park):
    lat = nan_to_none(park_row.get("lat"))
    lng = nan_to_none(park_row.get("lng"))

    fountain_objects = [build_fountain(f) for _, f in fountains_for_park.iterrows()]
    active_levels = [
        f["safety_level"] for f in fountain_objects
        if f["status"].upper() not in OFFLINE_STATUSES
    ]
    p_safety = park_safety(active_levels) if active_levels else "unknown"
    max_ppb = nan_to_none(park_row.get("max_lead_ever_ppb"))

    return {
        "park_id": str(park_row["park_id"]),
        "park_name": str(park_row["park_name"]),
        "address": str(park_row["park_address"]),
        "lat": round(float(lat), 6) if lat is not None else None,
        "lng": round(float(lng), 6) if lng is not None else None,
        "safety_level": p_safety,
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "total_fixture_count": int(park_row.get("total_fixture_count", 0)),
        "fountains": fountain_objects,
    }


def main():
    if not PARKS_CSV.exists():
        print(f"ERROR: {PARKS_CSV} not found. Run geocode_parks.py first.")
        return

    parks_df = pd.read_csv(PARKS_CSV, dtype={"park_id": str})
    fountains_df = pd.read_csv(FOUNTAINS_CSV, dtype={"fountain_id": str})

    # fountains.park_id is a row-index integer matching parks.id (not parks.park_id)
    # Normalize both to int for the join
    parks_df["_join_id"] = parks_df["id"].astype(int)
    fountains_df["_join_id"] = fountains_df["park_id"].astype(int)

    print(f"Loaded {len(parks_df)} parks, {len(fountains_df)} fountains")

    park_list = []
    for _, park_row in parks_df.iterrows():
        join_id = int(park_row["id"])
        park_fountains = fountains_df[fountains_df["_join_id"] == join_id]
        park_list.append(build_park(park_row, park_fountains))

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "park_count": len(park_list),
        "fountain_count": len(fountains_df),
        "parks": park_list,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    print(f"Wrote {OUTPUT_JSON}")
    print(f"  Parks: {output['park_count']}")
    print(f"  Fountains: {output['fountain_count']}")

    geocoded = sum(1 for p in park_list if p["lat"] is not None)
    print(f"  Parks with coordinates: {geocoded}/{len(park_list)}")


if __name__ == "__main__":
    main()
