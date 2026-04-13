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
FOIA_XLSX = BASE_DIR / "data/raw/FOIA_RESPONSES/R - 6464.xlsx"
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


def recommendation(level, ppb, status, remediation_plan, remediated, below_detection=False):
    """Human-readable recommendation string."""
    in_remediation = str(status).strip().upper() in REMEDIATION_STATUSES
    remediation_note = ""
    if in_remediation and remediation_plan:
        done = bool(remediated)
        remediation_note = f" Remediation {'complete' if done else 'in progress'}: {remediation_plan}."

    ppb_str = f"< {ppb:g}" if (below_detection and ppb is not None) else str(ppb)
    if level == "safe":
        return f"Safe to drink \u2014 last result: {ppb_str} ppb.{remediation_note}"
    elif level == "caution":
        return f"Use caution \u2014 last result: {ppb_str} ppb (near EPA limit of 15 ppb).{remediation_note}"
    elif level == "danger":
        return f"Do not drink \u2014 last result: {ppb_str} ppb (above EPA action level).{remediation_note}"
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


def parse_ppb(val):
    """Parse a ppb result value from the Excel. Handles '<2.00', '< 2.00', floats, NaN.
    Returns (value, below_detection) tuple where below_detection is True if original had '<'."""
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None, False
    s = str(val).strip()
    below = "<" in s
    s = s.replace("<", "").replace(" ", "")
    try:
        return round(float(s), 1), below
    except ValueError:
        return None, False


def load_test_history():
    """
    Parse the raw FOIA Excel and return a dict:
      fountain_id -> [{"round": str, "date": str, "result_ppb": float|None}, ...]
    sorted from most recent to oldest, with None-result entries omitted.
    """
    history = {}

    for sheet, id_col in [("Outdoor", 0), ("Indoor", 1)]:
        df = pd.read_excel(FOIA_XLSX, sheet_name=sheet, header=None)
        year_row = df.iloc[1]

        # Build list of (result_col, date_col, round_label) by scanning row 1
        # Year labels sit at even positions; propagate year forward for unlabelled followups
        rounds = []
        current_year = ""
        for col_idx in range(9 if sheet == "Outdoor" else 6, len(df.columns), 2):
            label = year_row.iloc[col_idx] if col_idx < len(year_row) else None
            if pd.notna(label):
                label = str(label).strip()
                # If the label contains a year, update current_year
                for y in ["2025", "2024", "2023", "2022", "2021"]:
                    if y in label:
                        current_year = y
                        break
                # If no year in label (e.g. "Followup 3"), prepend current year
                if not any(y in label for y in ["2025", "2024", "2023", "2022", "2021"]):
                    label = f"{current_year} {label}"
                rounds.append((col_idx, col_idx + 1, label))

        # Parse data rows (skip rows 0-2 which are headers)
        for _, row in df.iloc[3:].iterrows():
            fountain_id = str_or_none(row.iloc[id_col])
            if not fountain_id:
                continue
            results = []
            for res_col, date_col, label in rounds:
                ppb, below = parse_ppb(row.iloc[res_col] if res_col < len(row) else None)
                date_val = row.iloc[date_col] if date_col < len(row) else None
                date_str = None
                if pd.notna(date_val) and date_val is not None:
                    try:
                        date_str = pd.Timestamp(date_val).strftime("%Y-%m-%d")
                    except Exception:
                        pass
                if ppb is not None or date_str is not None:
                    entry = {"round": label, "date": date_str, "result_ppb": ppb}
                    if below:
                        entry["below_detection"] = True
                    results.append(entry)
            if results:
                # Sort most recent first; entries without a date go last
                results.sort(key=lambda r: r["date"] or "", reverse=True)
                history[fountain_id] = results

    print(f"Loaded test history for {len(history)} fountains")
    return history


def build_fountain(row, test_history=None):
    level = safety_level(row)
    ppb = nan_to_none(row.get("latest_result_ppb"))
    ppb_display = round(float(ppb), 1) if ppb is not None else None
    max_ppb = nan_to_none(row.get("max_lead_ever_ppb"))
    status = str(row.get("status", "")).strip()
    remediation_plan = str_or_none(row.get("remediation_plan"))
    remediated = bool(row.get("remediated", False))
    tested_2025 = bool(row.get("tested_2025", False))

    fountain_id = str(row["fountain_id"])
    history = test_history.get(fountain_id, []) if test_history else []

    # If the CSV is missing latest_result_ppb (common for fountains tested only in earlier
    # rounds), backfill from the most recent test history entry that has a result.
    below_detection = False
    if ppb_display is None:
        for entry in history:  # sorted most-recent-first
            if entry.get("result_ppb") is not None:
                ppb_display = entry["result_ppb"]
                below_detection = entry.get("below_detection", False)
                break
    else:
        for entry in history:
            if entry.get("result_ppb") is not None:
                below_detection = entry.get("below_detection", False)
                break

    # Recompute safety level using backfilled ppb if the CSV had it missing.
    # Offline statuses stay "unknown" regardless — the fixture isn't in service.
    if level == "unknown" and ppb_display is not None and status.upper() not in OFFLINE_STATUSES:
        v = float(ppb_display)
        if v < 5:
            level = "safe"
        elif v <= 15:
            level = "caution"
        else:
            level = "danger"

    return {
        "fountain_id": fountain_id,
        "location": str(row.get("location", "")),
        "location_description": str_or_none(row.get("location_description")),
        "type": str(row.get("type", "")),
        "is_bottle_filler": bool(row.get("is_bottle_filler", False)),
        "status": status,
        "latest_result_ppb": ppb_display,
        "below_detection_limit": below_detection,
        "tested_2025": tested_2025,
        "ever_elevated": bool(row.get("ever_elevated", False)),
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "remediation_plan": remediation_plan,
        "remediated": remediated,
        "safety_level": level,
        "recommendation": recommendation(level, ppb_display, status, remediation_plan, remediated, below_detection),
        "test_history": history,
    }


def build_park(park_row, fountains_for_park, test_history=None):
    lat = nan_to_none(park_row.get("lat"))
    lng = nan_to_none(park_row.get("lng"))

    fountain_objects = [build_fountain(f, test_history) for _, f in fountains_for_park.iterrows()]

    # Drop offline/removed fixtures that have no test history and no result — no data to show or confirm.
    # Offline fixtures with a test history are kept for historical reference.
    fountain_objects = [
        f for f in fountain_objects
        if not (
            f["status"].upper() in OFFLINE_STATUSES
            and f["latest_result_ppb"] is None
            and not f["test_history"]
        )
    ]

    active_levels = [
        f["safety_level"] for f in fountain_objects
        if f["status"].upper() not in OFFLINE_STATUSES
    ]
    p_safety = park_safety(active_levels) if active_levels else "unknown"
    max_ppb = nan_to_none(park_row.get("max_lead_ever_ppb"))

    # Only count active fixtures in the summary — OFF/REMOVED/DOES NOT EXIST
    # are excluded so "not yet tested" reflects genuinely untested active fountains.
    # Removed fixtures remain in the fountains array for audit purposes.
    # Only count active fixtures in the summary — OFF/REMOVED/DOES NOT EXIST
    # are excluded so "not yet tested" reflects genuinely untested active fountains.
    # Removed fixtures remain in the fountains array for audit purposes.
    fountain_counts = {
        "outdoor": {"safe": 0, "caution": 0, "danger": 0, "unknown": 0, "offline": 0},
        "indoor":  {"safe": 0, "caution": 0, "danger": 0, "unknown": 0, "offline": 0},
    }
    for f in fountain_objects:
        t = "outdoor" if f["type"] == "outdoor" else "indoor"
        if f["status"].upper() in OFFLINE_STATUSES:
            fountain_counts[t]["offline"] += 1
        else:
            fountain_counts[t][f["safety_level"]] += 1

    return {
        "park_id": str(park_row["park_id"]),
        "park_name": str(park_row["park_name"]),
        "address": str(park_row["park_address"]),
        "lat": round(float(lat), 6) if lat is not None else None,
        "lng": round(float(lng), 6) if lng is not None else None,
        "safety_level": p_safety,
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "total_fixture_count": int(park_row.get("total_fixture_count", 0)),
        "fountain_counts": fountain_counts,
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

    test_history = load_test_history()
    print(f"Loaded {len(parks_df)} parks, {len(fountains_df)} fountains")

    park_list = []
    for _, park_row in parks_df.iterrows():
        join_id = int(park_row["id"])
        park_fountains = fountains_df[fountains_df["_join_id"] == join_id]
        park_list.append(build_park(park_row, park_fountains, test_history))

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
