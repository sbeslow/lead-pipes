# Scripts

Data pipeline for building `data/build/fountains.json` from the processed CSVs.

## Setup

From the repo root:

```bash
pip install -r requirements.txt
```

## Step 1 — Geocode parks

Adds `lat` and `lng` columns to `parks.csv` using the US Census Batch Geocoder,
with Nominatim (OpenStreetMap) as a fallback for any unmatched addresses.

```bash
python scripts/geocode_parks.py
# Output: data/processed/parks_geocoded.csv
```

Only needs to be re-run if `parks.csv` changes.

## Step 2 — Build fountains.json

Merges `parks_geocoded.csv` and `fountains.csv` into a single JSON file,
computing safety levels and recommendation text for each fixture.

```bash
python scripts/build_data.py
# Output: data/build/fountains.json
```

Re-run whenever `fountains.csv` changes.
