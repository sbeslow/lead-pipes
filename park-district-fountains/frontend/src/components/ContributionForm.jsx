import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const CONTRIBUTIONS_API = "/api/submit";

export default function ContributionForm({ fountain, defaultOpen = false }) {
  const navigate = useNavigate();
  const [capturedLat, setCapturedLat] = useState(null);
  const [capturedLng, setCapturedLng] = useState(null);
  const [locStatus, setLocStatus] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocStatus("Geolocation not supported.");
      return;
    }
    setLocLoading(true);
    setLocStatus("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturedLat(pos.coords.latitude);
        setCapturedLng(pos.coords.longitude);
        setLocStatus(
          `Captured: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        );
        setLocLoading(false);
      },
      () => {
        setLocStatus("Could not get location.");
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const form = formRef.current;
    const correctionType =
      form.querySelector("input[name=correction_type]:checked")?.value || null;

    if (!correctionType && !capturedLat) {
      setError("Please select what you'd like to report, or share your location.");
      return;
    }

    const payload = {
      fountain_id: fountain.fountain_id,
      park_id: fountain.fountain_id.split("-")[0],
      correction_type: correctionType,
      lat: capturedLat,
      lng: capturedLng,
      notes: form.querySelector("[name=notes]").value.trim(),
      name: form.querySelector("[name=name]").value.trim(),
      email: form.querySelector("[name=email]").value.trim(),
      website: form.querySelector("[name=website]").value,
    };

    setSubmitting(true);
    try {
      const res = await fetch(CONTRIBUTIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess(true);
      setTimeout(() => navigate(-1), 1500);
      form.reset();
      setCapturedLat(null);
      setCapturedLng(null);
      setLocStatus("");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="contrib-details" open={defaultOpen || undefined}>
      <summary className="contrib-summary">Submit a correction</summary>
      <form className="contrib-form" ref={formRef} onSubmit={handleSubmit} noValidate>
        <input type="text" name="website" className="contrib-honeypot" tabIndex={-1} autoComplete="off" />

        <fieldset className="contrib-fieldset">
          <legend className="contrib-legend">What would you like to report?</legend>
          <label className="contrib-radio">
            <input type="radio" name="correction_type" value="fountain_is_on" />
            Fountain is ON (app says off or unknown)
          </label>
          <label className="contrib-radio">
            <input type="radio" name="correction_type" value="fountain_is_off" />
            Fountain is OFF (app says on)
          </label>
          <label className="contrib-radio">
            <input type="radio" name="correction_type" value="other" />
            Other note
          </label>
        </fieldset>

        <div className="contrib-location">
          <p className="contrib-location-label">Pin this fountain's exact location</p>
          <p className="contrib-location-desc">
            The app places fountains at the park's center. If you're standing at this
            fountain right now, sharing your GPS helps us show its exact spot on the map.
          </p>
          {locStatus && <p className="contrib-location-text">{locStatus}</p>}
          <button
            type="button"
            className="contrib-loc-btn"
            onClick={captureLocation}
            disabled={locLoading}
          >
            {locLoading ? "Getting location…" : capturedLat ? "Update location" : "Use my current location"}
          </button>
        </div>

        <label className="contrib-label">
          Notes <span className="contrib-optional">(optional)</span>
          <textarea
            className="contrib-textarea"
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="e.g. The handle is broken, no water comes out."
          />
        </label>
        <label className="contrib-label">
          Your name <span className="contrib-optional">(optional)</span>
          <input type="text" className="contrib-input" name="name" maxLength={100} autoComplete="name" />
        </label>
        <label className="contrib-label">
          Email <span className="contrib-optional">(optional, for follow-up)</span>
          <input type="email" className="contrib-input" name="email" maxLength={200} autoComplete="email" />
        </label>

        {error && <p className="contrib-error">{error}</p>}
        <button type="submit" className="contrib-submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
        {success && (
          <p className="contrib-success">Thanks — your correction was submitted!</p>
        )}
      </form>
    </details>
  );
}
