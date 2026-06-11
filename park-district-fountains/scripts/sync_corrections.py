"""
Download all user submissions from S3 and write them to data/corrections/submissions.csv.

Usage:
    DRINK_HERE_SUBMISSIONS_S3=my-bucket python scripts/sync_corrections.py
    python scripts/sync_corrections.py --bucket my-bucket
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

import boto3

COLUMNS = ["timestamp", "fountain_id", "park_id", "correction_type", "lat", "lng", "notes", "name", "email"]
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "corrections" / "submissions.csv"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", default=os.environ.get("DRINK_HERE_SUBMISSIONS_S3"))
    args = parser.parse_args()

    if not args.bucket:
        sys.exit("Error: set DRINK_HERE_SUBMISSIONS_S3 env var or pass --bucket <name>")

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
            rows.append({col: data.get(col) for col in COLUMNS})

    rows.sort(key=lambda r: r.get("timestamp") or "", reverse=True)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    gps_count = sum(1 for r in rows if r.get("lat") is not None)
    print(f"{len(rows)} submissions downloaded, {gps_count} with GPS coordinates")
    print(f"Written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
