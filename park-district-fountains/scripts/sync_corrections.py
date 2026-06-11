"""
Download all user submissions from S3, write them to data/corrections/submissions.csv,
and apply GPS coordinates back to data/processed/fountains.csv.

Rules for each GPS submission:
  - Fountain has no coordinates → apply immediately
  - Fountain already has coordinates within 10 ft → disregard (keep existing)
  - Fountain already has coordinates more than 10 ft away → print to stderr
    and write to data/corrections/conflicts.csv; do NOT update the CSV

Usage:
    DRINK_HERE_SUBMISSIONS_S3=<bucket> python scripts/sync_corrections.py
    python scripts/sync_corrections.py --bucket <bucket>
"""

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

import boto3

BASE = Path(__file__).parent.parent
SUBMISSIONS_PATH = BASE / "data" / "corrections" / "submissions.csv"
CONFLICTS_PATH   = BASE / "data" / "corrections" / "conflicts.csv"
FOUNTAINS_CSV    = BASE / "data" / "processed" / "fountains.csv"

SUBMISSION_COLS = ["timestamp", "fountain_id", "park_id", "correction_type", "lat", "lng", "notes", "name", "email"]
CONFLICT_COLS   = ["fountain_id", "park_id", "existing_lat", "existing_lng", "new_lat", "new_lng", "distance_ft", "submission_timestamp", "notes"]

TEN_FEET_M = 3.048


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def m_to_ft(m):
    return m * 3.28084


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", default=os.environ.get("DRINK_HERE_SUBMISSIONS_S3"))
    args = parser.parse_args()

    if not args.bucket:
        sys.exit("Error: set DRINK_HERE_SUBMISSIONS_S3 env var or pass --bucket <name>")

    # --- Download submissions from S3 ---
    s3 = boto3.client("s3")
    rows = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=args.bucket, Prefix="submissions/"):
        for obj in page.get("Contents", []):
            body = s3.get_object(Bucket=args.bucket, Key=obj["Key"])["Body"].read()
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                print(f"  Skipping malformed JSON: {obj['Key']}", file=sys.stderr)
                continue
            rows.append({col: data.get(col) for col in SUBMISSION_COLS})

    rows.sort(key=lambda r: r.get("timestamp") or "", reverse=True)

    SUBMISSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SUBMISSIONS_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SUBMISSION_COLS)
        writer.writeheader()
        writer.writerows(rows)

    gps_rows = [r for r in rows if r.get("lat") is not None and r.get("lng") is not None]
    print(f"{len(rows)} submissions downloaded, {len(gps_rows)} with GPS coordinates")

    # --- Load fountains.csv ---
    with open(FOUNTAINS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        fountains = {row["fountain_id"]: row for row in reader}

    # Process oldest → newest so the most recent GPS reading wins
    gps_chrono = sorted(gps_rows, key=lambda r: r.get("timestamp") or "")

    updated = 0
    conflicts = []

    for sub in gps_chrono:
        fid = sub["fountain_id"]
        if fid not in fountains:
            print(f"  Warning: fountain_id {fid} not found in fountains.csv", file=sys.stderr)
            continue

        fountain = fountains[fid]
        new_lat = float(sub["lat"])
        new_lng = float(sub["lng"])

        ex_lat = (fountain.get("lat") or "").strip()
        ex_lng = (fountain.get("lng") or "").strip()

        if not ex_lat or not ex_lng:
            fountain["lat"] = str(new_lat)
            fountain["lng"] = str(new_lng)
            updated += 1
        else:
            dist_ft = m_to_ft(haversine_m(float(ex_lat), float(ex_lng), new_lat, new_lng))
            if dist_ft <= 10:
                pass  # close enough — keep existing
            else:
                conflicts.append({
                    "fountain_id":          fid,
                    "park_id":              sub.get("park_id", ""),
                    "existing_lat":         ex_lat,
                    "existing_lng":         ex_lng,
                    "new_lat":              new_lat,
                    "new_lng":              new_lng,
                    "distance_ft":          round(dist_ft, 1),
                    "submission_timestamp": sub.get("timestamp", ""),
                    "notes":                sub.get("notes", ""),
                })
                print(
                    f"  CONFLICT {fid}: existing ({ex_lat}, {ex_lng}) vs "
                    f"new ({new_lat}, {new_lng}) — {round(dist_ft, 1)} ft apart",
                    file=sys.stderr,
                )

    # --- Write updated fountains.csv ---
    with open(FOUNTAINS_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(fountains.values())

    print(f"{updated} fountain coordinate(s) updated in fountains.csv")

    # --- Write or clear conflicts.csv ---
    if conflicts:
        with open(CONFLICTS_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CONFLICT_COLS)
            writer.writeheader()
            writer.writerows(conflicts)
        print(f"\n⚠️  {len(conflicts)} conflict(s) require review — see {CONFLICTS_PATH}", file=sys.stderr)
    else:
        if CONFLICTS_PATH.exists():
            CONFLICTS_PATH.unlink()

    print(f"Submissions written to: {SUBMISSIONS_PATH}")


if __name__ == "__main__":
    main()
