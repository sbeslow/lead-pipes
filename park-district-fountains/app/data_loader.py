"""
Builds the full parks+fountains data structure from source CSVs and the FOIA
Excel file. Called at Flask startup so no pre-built JSON artifact is needed.
"""

import math
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).parent.parent
PARKS_CSV = BASE_DIR / "data/processed/parks.csv"
FOUNTAINS_CSV = BASE_DIR / "data/processed/fountains.csv"
TESTS_CSV = BASE_DIR / "data/processed/tests.csv"

OFFLINE_STATUSES = {"OFF", "REMOVED", "DOES NOT EXIST"}
REMEDIATION_STATUSES = {"CONT"}
SAFETY_RANK = {"danger": 3, "caution": 2, "unknown": 1, "safe": 0}


def _safety_level(row):
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


def _recommendation(level, ppb, status, remediation_plan, remediated, below_detection=False):
    in_remediation = str(status).strip().upper() in REMEDIATION_STATUSES
    remediation_note = ""
    if in_remediation and remediation_plan:
        done = bool(remediated)
        remediation_note = f" Remediation {'complete' if done else 'in progress'}: {remediation_plan}."

    ppb_str = f"< {ppb:g}" if (below_detection and ppb is not None) else str(ppb)
    if level == "safe":
        return f"Safe to drink — last result: {ppb_str} ppb.{remediation_note}"
    elif level == "caution":
        return f"Use caution — last result: {ppb_str} ppb (near EPA limit of 15 ppb).{remediation_note}"
    elif level == "danger":
        return f"Do not drink — last result: {ppb_str} ppb (above EPA action level).{remediation_note}"
    else:
        if in_remediation:
            plan = f": {remediation_plan}" if remediation_plan else ""
            return f"Fountain under remediation{plan} — no test result available."
        return "Fountain is offline or removed."


def _nan_to_none(val):
    if isinstance(val, float) and math.isnan(val):
        return None
    return val


def _str_or_none(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).strip()
    return s if s else None


def _load_test_history():
    df = pd.read_csv(TESTS_CSV, dtype={"fountain_id": str})
    history = {}
    for _, row in df.iterrows():
        fid = row["fountain_id"]
        entry = {
            "round": row["round"],
            "date": row["date"] if pd.notna(row["date"]) else None,
            "result_ppb": row["result_ppb"] if pd.notna(row["result_ppb"]) else None,
        }
        if str(row.get("below_detection", "false")).lower() == "true":
            entry["below_detection"] = True
        history.setdefault(fid, []).append(entry)
    for fid in history:
        history[fid].sort(key=lambda r: r["date"] or "", reverse=True)
    return history


def _build_fountain(row, test_history=None):
    level = _safety_level(row)
    ppb = _nan_to_none(row.get("latest_result_ppb"))
    ppb_display = round(float(ppb), 1) if ppb is not None else None
    max_ppb = _nan_to_none(row.get("max_lead_ever_ppb"))
    status = str(row.get("status", "")).strip()
    remediation_plan = _str_or_none(row.get("remediation_plan"))
    remediated = bool(row.get("remediated", False))
    tested_2025 = bool(row.get("tested_2025", False))

    fountain_id = str(row["fountain_id"])
    history = test_history.get(fountain_id, []) if test_history else []

    below_detection = False
    if ppb_display is None:
        for entry in history:
            if entry.get("result_ppb") is not None:
                ppb_display = entry["result_ppb"]
                below_detection = entry.get("below_detection", False)
                break
    else:
        for entry in history:
            if entry.get("result_ppb") is not None:
                below_detection = entry.get("below_detection", False)
                break

    if level == "unknown" and ppb_display is not None and status.upper() not in OFFLINE_STATUSES:
        v = float(ppb_display)
        if v < 5:
            level = "safe"
        elif v <= 15:
            level = "caution"
        else:
            level = "danger"

    lat = _nan_to_none(row.get("lat"))
    lng = _nan_to_none(row.get("lng"))

    return {
        "fountain_id": fountain_id,
        "location": str(row.get("location", "")),
        "location_description": _str_or_none(row.get("location_description")),
        "type": str(row.get("type", "")),
        "is_bottle_filler": bool(row.get("is_bottle_filler", False)),
        "status": status,
        "lat": round(float(lat), 6) if lat is not None else None,
        "lng": round(float(lng), 6) if lng is not None else None,
        "latest_result_ppb": ppb_display,
        "below_detection_limit": below_detection,
        "tested_2025": tested_2025,
        "ever_elevated": bool(row.get("ever_elevated", False)),
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "remediation_plan": remediation_plan,
        "remediated": remediated,
        "safety_level": level,
        "recommendation": _recommendation(level, ppb_display, status, remediation_plan, remediated, below_detection),
        "test_history": history,
    }


def _outdoor_summary_part(out, out_tested):
    if out_tested == 0:
        return None
    if out["caution"] == 0 and out["danger"] == 0:
        return "outdoor all safe"
    parts = []
    if out["danger"] > 0:
        parts.append(f"{out['danger']} outdoor do not drink")
    if out["caution"] > 0:
        parts.append(f"{out['caution']} outdoor caution")
    if out["safe"] > 0:
        parts.append(f"{out['safe']} outdoor safe")
    return " · ".join(parts)


def _indoor_summary_part(inn, inn_tested, problematic_fixtures):
    if inn_tested == 0 or (inn["caution"] == 0 and inn["danger"] == 0):
        return None
    if len(problematic_fixtures) <= 2:
        descs = []
        for f in problematic_fixtures:
            label = "do not drink" if f["safety_level"] == "danger" else "at caution"
            loc = f["location"] or "indoor fixture"
            descs.append(f"{loc} {label}")
        return " · ".join(descs)
    parts = []
    if inn["danger"] > 0:
        parts.append(f"{inn['danger']} indoor do not drink")
    if inn["caution"] > 0:
        parts.append(f"{inn['caution']} indoor caution")
    return " · ".join(parts)


def _park_summary(fountain_objects, fountain_counts):
    fc = fountain_counts
    out = fc["outdoor"]
    inn = fc["indoor"]
    out_tested = out["safe"] + out["caution"] + out["danger"]
    inn_tested = inn["safe"] + inn["caution"] + inn["danger"]
    total_tested = out_tested + inn_tested

    if total_tested > 0 and out["caution"] + out["danger"] + inn["caution"] + inn["danger"] == 0:
        return f"All {total_tested} tested safe"

    outdoor_part = _outdoor_summary_part(out, out_tested)
    problematic_indoor = [
        f for f in fountain_objects
        if f["type"] != "outdoor"
        and f["status"].upper() not in OFFLINE_STATUSES
        and f["safety_level"] in ("caution", "danger")
    ]
    indoor_part = _indoor_summary_part(inn, inn_tested, problematic_indoor)

    parts = [p for p in [outdoor_part, indoor_part] if p]
    if parts:
        text = " · ".join(parts)
        return text[0].upper() + text[1:]

    total_unknown = out["unknown"] + inn["unknown"]
    if total_unknown:
        return f"{total_unknown} fixture{'s' if total_unknown != 1 else ''} not yet tested"
    return None


def _park_safety(fountain_levels):
    if not fountain_levels:
        return "unknown"
    return max(fountain_levels, key=lambda lvl: SAFETY_RANK[lvl])


def _build_park(park_row, fountains_for_park, test_history=None):
    lat = _nan_to_none(park_row.get("lat"))
    lng = _nan_to_none(park_row.get("lng"))

    fountain_objects = [_build_fountain(f, test_history) for _, f in fountains_for_park.iterrows()]

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
    p_safety = _park_safety(active_levels) if active_levels else "unknown"
    max_ppb = _nan_to_none(park_row.get("max_lead_ever_ppb"))

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
        "summary": _park_summary(fountain_objects, fountain_counts),
        "max_lead_ever_ppb": round(float(max_ppb), 1) if max_ppb is not None else None,
        "total_fixture_count": int(park_row.get("total_fixture_count", 0)),
        "fountain_counts": fountain_counts,
        "fountains": fountain_objects,
    }


def load_parks():
    """Build and return the full parks list from source CSVs and FOIA Excel."""
    parks_df = pd.read_csv(PARKS_CSV, dtype={"park_id": str})
    fountains_df = pd.read_csv(FOUNTAINS_CSV, dtype={"fountain_id": str})

    parks_df["_join_id"] = parks_df["id"].astype(int)
    fountains_df["_join_id"] = fountains_df["park_id"].astype(int)

    test_history = _load_test_history()

    park_list = []
    for _, park_row in parks_df.iterrows():
        join_id = int(park_row["id"])
        park_fountains = fountains_df[fountains_df["_join_id"] == join_id]
        park_list.append(_build_park(park_row, park_fountains, test_history))

    return park_list
