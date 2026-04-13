import { useParams } from "react-router-dom";
import SafetyBadge from "../components/SafetyBadge";
import ContributionForm from "../components/ContributionForm";
import { formatPpb, lastTestedLabel } from "../utils/formatters";
import { useData } from "../DataContext";

export default function FountainDetail() {
  const { fountainId } = useParams();
  const { parks } = useData();

  let fountain = null;
  for (const park of parks) {
    const f = park.fountains.find((f) => f.fountain_id === fountainId);
    if (f) { fountain = f; break; }
  }

  if (!fountain) {
    return <p style={{ padding: 20 }}>Fountain not found.</p>;
  }

  const f = fountain;
  const lastTested = lastTestedLabel(f, true);

  return (
    <div id="fountain-detail">
      <div className={`fd-header ${f.safety_level}`}>
        <div>
          <h2 className="fd-title">{f.location}</h2>
          {f.location_description && (
            <p className="fd-subtitle">{f.location_description}</p>
          )}
        </div>
        <SafetyBadge level={f.safety_level} fountain={f} />
      </div>

      <p className={`rec ${f.safety_level} fd-rec`}>{f.recommendation}</p>

      <div className="fd-stats">
        {f.latest_result_ppb != null && (
          <div className="fd-stat">
            <span className="fd-stat-label">Latest result</span>
            <span className="fd-stat-value">
              {formatPpb(f.latest_result_ppb, f.below_detection_limit)}
            </span>
          </div>
        )}
        {f.max_lead_ever_ppb != null && (
          <div className="fd-stat">
            <span className="fd-stat-label">Historical high</span>
            <span className={`fd-stat-value${f.ever_elevated ? " elevated" : ""}`}>
              {f.max_lead_ever_ppb} ppb
            </span>
          </div>
        )}
        <div className="fd-stat">
          <span className="fd-stat-label">Last tested</span>
          <span className="fd-stat-value">{lastTested}</span>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Type</span>
          <span className="fd-stat-value">{f.type}</span>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Status</span>
          <span className="fd-stat-value">{f.status}</span>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Bottle filler</span>
          <span className="fd-stat-value">{f.is_bottle_filler ? "Yes" : "No"}</span>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Ever elevated</span>
          <span className={`fd-stat-value${f.ever_elevated ? " elevated" : ""}`}>
            {f.ever_elevated ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {f.remediation_plan && (
        <div className="fd-section">
          <p className="fd-section-label">Remediation</p>
          <p className="fd-section-value">{f.remediation_plan}</p>
          <p className={`f-remediation ${f.remediated ? "done" : "pending"} fd-inline`}>
            {f.remediated ? "Complete" : "In progress"}
          </p>
        </div>
      )}

      {f.test_history && f.test_history.length > 0 && (
        <div className="fd-section">
          <p className="fd-section-label">Test history</p>
          <table className="test-history">
            <thead>
              <tr>
                <th>Date</th>
                <th>Round</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {f.test_history.map((t, i) => {
                const ppb = t.result_ppb;
                const lvl =
                  ppb == null
                    ? "unknown"
                    : ppb < 5
                    ? "safe"
                    : ppb <= 15
                    ? "caution"
                    : "danger";
                return (
                  <tr key={i}>
                    <td>{t.date ?? "—"}</td>
                    <td>{t.round}</td>
                    <td className={`th-result ${lvl}`}>
                      {formatPpb(ppb, t.below_detection)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="fd-id">Fixture ID: {f.fountain_id}</p>

      <ContributionForm fountain={f} />
    </div>
  );
}
