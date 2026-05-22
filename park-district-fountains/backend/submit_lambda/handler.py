import json
import os
import re
from datetime import datetime, timezone

import boto3

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


def clean_text(val, max_len):
    if not val:
        return ""
    s = re.sub(r"[\x00-\x1f\x7f]", " ", str(val))
    return s.strip()[:max_len]


def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": {}, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return respond(400, {"error": "Invalid JSON"})

    if body.get("website"):
        return respond(200, {"ok": True})

    fountain_id = body.get("fountain_id")
    if not fountain_id or not isinstance(fountain_id, str):
        return respond(400, {"error": "fountain_id is required"})

    correction_type = body.get("correction_type")
    lat = body.get("lat")
    lng = body.get("lng")

    if correction_type and correction_type not in ALLOWED_CORRECTION_TYPES:
        return respond(400, {"error": f"correction_type must be one of: {', '.join(ALLOWED_CORRECTION_TYPES)}"})

    if not correction_type and lat is None:
        return respond(400, {"error": "correction_type or a GPS location is required"})

    if lat is not None and (not isinstance(lat, (int, float)) or lat < -90 or lat > 90):
        return respond(400, {"error": "Invalid lat"})

    if lng is not None and (not isinstance(lng, (int, float)) or lng < -180 or lng > 180):
        return respond(400, {"error": "Invalid lng"})

    now = datetime.now(timezone.utc)
    date_prefix = now.strftime("%Y-%m-%d")
    ts = int(now.timestamp() * 1000)

    submission = {
        "timestamp": now.isoformat(),
        "fountain_id": clean_text(fountain_id, 50),
        "park_id": clean_text(body.get("park_id"), 50),
        "correction_type": correction_type or None,
        "lat": lat if lat is not None else None,
        "lng": lng if lng is not None else None,
        "notes": clean_text(body.get("notes"), MAX_NOTES_LENGTH),
        "name": clean_text(body.get("name"), MAX_NAME_LENGTH),
        "email": clean_text(body.get("email"), MAX_EMAIL_LENGTH),
    }

    bucket = os.environ.get("DRINK_HERE_SUBMISSIONS_S3")
    if not bucket:
        print("Submission (no S3):", json.dumps(submission))
        return respond(200, {"ok": True})

    key = f"submissions/{date_prefix}/{ts}-{submission['fountain_id']}.json"
    try:
        get_s3().put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(submission, indent=2),
            ContentType="application/json",
        )
        return respond(200, {"ok": True})
    except Exception as e:
        print("S3 write failed:", e)
        return respond(500, {"error": "Failed to save submission"})
