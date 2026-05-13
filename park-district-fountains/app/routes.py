import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import boto3
from flask import Blueprint, current_app, jsonify, request, send_from_directory

bp = Blueprint("routes", __name__)

_fountains_cache = None

DATA_PATH = Path(__file__).parent.parent / "data" / "build" / "fountains.json"

ALLOWED_CORRECTION_TYPES = {"fountain_is_on", "fountain_is_off", "other"}
MAX_NOTES_LENGTH = 500
MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 200

_s3_client = None


def get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def get_fountains():
    global _fountains_cache
    if _fountains_cache is None:
        with open(DATA_PATH) as f:
            _fountains_cache = json.load(f)
    return _fountains_cache


def clean_text(val, max_len):
    if not val:
        return ""
    # Remove control characters
    s = re.sub(r"[\x00-\x1f\x7f]", " ", str(val))
    return s.strip()[:max_len]


@bp.route("/api/data")
def api_data():
    return jsonify(get_fountains())


@bp.route("/api/submit", methods=["POST"])
def api_submit():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON"}), 400

    # Honeypot
    if data.get("website"):
        return jsonify({"ok": True})

    fountain_id = data.get("fountain_id")
    if not fountain_id or not isinstance(fountain_id, str):
        return jsonify({"error": "fountain_id is required"}), 400

    correction_type = data.get("correction_type")
    lat = data.get("lat")
    lng = data.get("lng")

    if correction_type and correction_type not in ALLOWED_CORRECTION_TYPES:
        return jsonify({"error": f"correction_type must be one of: {', '.join(ALLOWED_CORRECTION_TYPES)}"}), 400

    if not correction_type and lat is None:
        return jsonify({"error": "correction_type or a GPS location is required"}), 400

    if lat is not None and (not isinstance(lat, (int, float)) or lat < -90 or lat > 90):
        return jsonify({"error": "Invalid lat"}), 400

    if lng is not None and (not isinstance(lng, (int, float)) or lng < -180 or lng > 180):
        return jsonify({"error": "Invalid lng"}), 400

    now = datetime.now(timezone.utc)
    date_prefix = now.strftime("%Y-%m-%d")
    ts = int(now.timestamp() * 1000)

    submission = {
        "timestamp": now.isoformat(),
        "fountain_id": clean_text(fountain_id, 50),
        "park_id": clean_text(data.get("park_id"), 50),
        "correction_type": correction_type or None,
        "lat": lat if lat is not None else None,
        "lng": lng if lng is not None else None,
        "notes": clean_text(data.get("notes"), MAX_NOTES_LENGTH),
        "name": clean_text(data.get("name"), MAX_NAME_LENGTH),
        "email": clean_text(data.get("email"), MAX_EMAIL_LENGTH),
    }

    bucket = os.environ.get("DRINK_HERE_SUBMISSIONS_S3")
    if not bucket:
        # No S3 configured — log and accept (dev mode)
        current_app.logger.info("Submission (no S3): %s", json.dumps(submission))
        return jsonify({"ok": True})

    key = f"submissions/{date_prefix}/{ts}-{submission['fountain_id']}.json"
    try:
        get_s3().put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(submission, indent=2),
            ContentType="application/json",
        )
        return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.error("S3 write failed: %s", e)
        return jsonify({"error": "Failed to save submission"}), 500


# Catch-all: serve React app for all non-API routes
@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve_spa(path):
    dist = Path(current_app.static_folder)
    file_path = dist / path
    if path and file_path.exists():
        return send_from_directory(str(dist), path)
    return send_from_directory(str(dist), "index.html")
