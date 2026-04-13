/**
 * Lambda handler: receives anonymous fountain corrections and writes each
 * submission as a JSON file to S3.
 *
 * Files land at: s3://<BUCKET_NAME>/submissions/YYYY-MM-DD/<timestamp>-<fountain_id>.json
 * Review with:   aws s3 sync s3://<BUCKET_NAME>/submissions/ ./submissions/
 *
 * Environment variables required:
 *   BUCKET_NAME  — name of the private S3 bucket for submissions
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

const ALLOWED_CORRECTION_TYPES = ["fountain_is_on", "fountain_is_off", "other"];
const MAX_NOTES_LENGTH = 500;
const MAX_NAME_LENGTH  = 100;
const MAX_EMAIL_LENGTH = 200;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return corsResponse(200, {});
  }
  if (event.httpMethod !== "POST") {
    return corsResponse(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return corsResponse(400, { error: "Invalid JSON" });
  }

  // Honeypot — bots fill this in; humans leave it blank
  if (body.website) {
    return corsResponse(200, { ok: true });
  }

  const { fountain_id, park_id, correction_type, lat, lng, notes, name, email } = body;

  if (!fountain_id || typeof fountain_id !== "string") {
    return corsResponse(400, { error: "fountain_id is required" });
  }
  if (correction_type && !ALLOWED_CORRECTION_TYPES.includes(correction_type)) {
    return corsResponse(400, { error: `correction_type must be one of: ${ALLOWED_CORRECTION_TYPES.join(", ")}` });
  }
  if (!correction_type && lat == null) {
    return corsResponse(400, { error: "correction_type or a GPS location is required" });
  }
  if (lat != null && (typeof lat !== "number" || lat < -90  || lat > 90))  {
    return corsResponse(400, { error: "Invalid lat" });
  }
  if (lng != null && (typeof lng !== "number" || lng < -180 || lng > 180)) {
    return corsResponse(400, { error: "Invalid lng" });
  }

  const clean = (val, maxLen) => {
    if (!val) return "";
    return String(val).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, maxLen);
  };

  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const submission = {
    timestamp:       now.toISOString(),
    fountain_id:     clean(fountain_id, 50),
    park_id:         clean(park_id, 50),
    correction_type: correction_type || null,
    lat:             lat  != null ? lat  : null,
    lng:             lng  != null ? lng  : null,
    notes:           clean(notes, MAX_NOTES_LENGTH),
    name:            clean(name,  MAX_NAME_LENGTH),
    email:           clean(email, MAX_EMAIL_LENGTH),
  };

  const key = `submissions/${datePrefix}/${now.getTime()}-${submission.fountain_id}.json`;

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.BUCKET_NAME,
      Key:         key,
      Body:        JSON.stringify(submission, null, 2),
      ContentType: "application/json",
    }));
    return corsResponse(200, { ok: true });
  } catch (err) {
    console.error("S3 write failed:", err);
    return corsResponse(500, { error: "Failed to save submission" });
  }
};

function corsResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type":                 "application/json",
    },
    body: JSON.stringify(body),
  };
}
