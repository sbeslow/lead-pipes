#!/usr/bin/env python3
"""
Step 1: Geocode parks using US Census Batch Geocoder with Nominatim fallback.
Output: data/processed/parks_geocoded.csv
"""

import csv
import io
import time
import pandas as pd
import requests

BASE_DIR = __file__.replace("scripts/geocode_parks.py", "")
INPUT_CSV = BASE_DIR + "data/processed/parks.csv"
OUTPUT_CSV = BASE_DIR + "data/processed/parks_geocoded.csv"

CENSUS_ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"


def build_census_batch(parks_df):
    """Build a CSV string in Census Geocoder format."""
    lines = []
    for _, row in parks_df.iterrows():
        address = f"{row['park_address']}, Chicago, IL"
        # Format: Unique ID, Street address, City, State, ZIP
        lines.append(f'{row["park_id"]},"{address}","Chicago","IL",')
    return "\n".join(lines)


def parse_census_response(response_text):
    """Parse Census Geocoder batch response into a dict of park_id -> (lat, lng).

    Response columns: ID, input_address, match_status, match_type, matched_address, coords, tiger_line_id, side
    coords format: "lng,lat"
    """
    results = {}
    reader = csv.reader(io.StringIO(response_text.strip()))
    for row in reader:
        if len(row) < 6:
            continue
        park_id = row[0].strip()
        match_status = row[2].strip().lower()
        if match_status not in ("match", "tie"):
            continue
        coords_field = row[5].strip()
        if not coords_field:
            continue
        try:
            lng_str, lat_str = coords_field.split(",")
            results[park_id] = (float(lat_str), float(lng_str))
        except ValueError:
            continue
    return results


def geocode_with_census(parks_df):
    """Submit all parks to Census Batch Geocoder. Returns dict of park_id -> (lat, lng)."""
    batch_csv = build_census_batch(parks_df)
    print(f"Submitting {len(parks_df)} parks to Census Batch Geocoder...")

    try:
        response = requests.post(
            CENSUS_ENDPOINT,
            files={
                "addressFile": ("addresses.csv", io.StringIO(batch_csv), "text/csv"),
                "benchmark": (None, "2020"),
            },
            timeout=120,
        )
        response.raise_for_status()
        results = parse_census_response(response.text)
        print(f"Census matched {len(results)} of {len(parks_df)} parks")
        return results
    except requests.RequestException as e:
        print(f"Census Geocoder request failed: {e}")
        return {}


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "shouldidrinkherecom-geocoder/1.0"}


def _nominatim_query(q):
    """Single Nominatim query via requests with SSL verification disabled."""
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": q, "format": "json", "limit": 1},
            headers=NOMINATIM_HEADERS,
            timeout=10,
            verify=False,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass
    return None


def geocode_with_nominatim(parks_df, already_geocoded):
    """Fallback: geocode unmatched parks using Nominatim (OpenStreetMap)."""
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    results = {}
    unmatched = parks_df[~parks_df["park_id"].astype(str).isin(already_geocoded)]
    print(f"Falling back to Nominatim for {len(unmatched)} unmatched parks...")

    for _, row in unmatched.iterrows():
        park_id = str(row["park_id"])
        address = f"{row['park_address']}, Chicago, IL"
        coords = _nominatim_query(address)
        if not coords:
            coords = _nominatim_query(f"{row['park_name']} Park, Chicago, IL")
        if coords:
            results[park_id] = coords
        else:
            print(f"  Could not geocode: {row['park_name']} ({address})")
        time.sleep(1.1)  # Nominatim rate limit: 1 request/second

    print(f"Nominatim matched {len(results)} additional parks")
    return results


def main():
    parks_df = pd.read_csv(INPUT_CSV, dtype={"park_id": str})
    print(f"Loaded {len(parks_df)} parks from {INPUT_CSV}")

    census_results = geocode_with_census(parks_df)
    nominatim_results = geocode_with_nominatim(parks_df, census_results)

    all_results = {**census_results, **nominatim_results}
    print(f"\nTotal geocoded: {len(all_results)} of {len(parks_df)} parks")

    parks_df["lat"] = parks_df["park_id"].astype(str).map(
        lambda pid: all_results.get(pid, (None, None))[0]
    )
    parks_df["lng"] = parks_df["park_id"].astype(str).map(
        lambda pid: all_results.get(pid, (None, None))[1]
    )

    parks_df.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved geocoded parks to {OUTPUT_CSV}")

    geocoded_count = parks_df["lat"].notna().sum()
    print(f"Parks with coordinates: {geocoded_count}/{len(parks_df)}")


if __name__ == "__main__":
    main()
