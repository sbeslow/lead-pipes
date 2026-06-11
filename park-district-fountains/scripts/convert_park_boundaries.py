"""
Convert CPD park boundary shapefile (EPSG:3435, Illinois East US survey feet)
to a GeoJSON FeatureCollection in WGS84 (EPSG:4326) for use with Leaflet.

Input:  data/raw/ParkDistrictParks/CPD_Boundaries.shp
Output: frontend/public/park_boundaries.geojson

Join key: feature.properties.PARK_NO == parseInt(park.park_id) in the app.

Usage:
    pip install pyshp pyproj
    python scripts/convert_park_boundaries.py
"""

import json
from pathlib import Path

import shapefile
from pyproj import Transformer

SHP = Path(__file__).parent.parent / "data" / "raw" / "ParkDistrictParks" / "CPD_Boundaries" / "CPD_Boundaries.shp"
OUT = Path(__file__).parent.parent / "frontend" / "public" / "park_boundaries.geojson"

# EPSG:3435 = NAD83 / Illinois State Plane East (US survey feet)
transformer = Transformer.from_crs("EPSG:3435", "EPSG:4326", always_xy=True)


def convert_ring(points):
    """Convert a list of (x, y) projected points to [lng, lat] GeoJSON pairs."""
    return [list(transformer.transform(x, y)) for x, y in points]


def shape_to_geometry(shape):
    """Convert a pyshp shape to a GeoJSON geometry dict."""
    if shape.shapeType in (5, 15, 25):  # Polygon variants
        parts = list(shape.parts) + [len(shape.points)]
        rings = [
            convert_ring(shape.points[parts[i]: parts[i + 1]])
            for i in range(len(parts) - 1)
        ]
        # Treat as Polygon (single exterior + optional holes)
        return {"type": "Polygon", "coordinates": rings}
    return None


def main():
    sf = shapefile.Reader(str(SHP))
    fields = [f[0] for f in sf.fields[1:]]  # skip deletion flag

    features = []
    skipped = 0

    for sr in sf.shapeRecords():
        record = dict(zip(fields, sr.record))
        geometry = shape_to_geometry(sr.shape)
        if geometry is None:
            skipped += 1
            continue

        try:
            park_no = int(record["PARK_NO"])
        except (KeyError, ValueError, TypeError):
            skipped += 1
            continue

        features.append({
            "type": "Feature",
            "properties": {
                "PARK_NO": park_no,
                "PARK": str(record.get("PARK", "")).strip(),
            },
            "geometry": geometry,
        })

    geojson = {"type": "FeatureCollection", "features": features}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))  # compact — no pretty-print

    print(f"{len(features)} park boundaries written to {OUT}")
    if skipped:
        print(f"  ({skipped} shapes skipped — unsupported geometry type)")


if __name__ == "__main__":
    main()
