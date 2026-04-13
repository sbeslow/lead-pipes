import { useNavigate } from "react-router-dom";
import SafetyBadge from "./SafetyBadge";
import { lastTestedLabel } from "../utils/formatters";

export default function FountainRow({ fountain: f }) {
  const navigate = useNavigate();

  const handler = () => navigate(`/fountains/${f.fountain_id}`);

  return (
    <div
      className={`fountain-row ${f.safety_level}`}
      role="button"
      tabIndex={0}
      onClick={handler}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handler();
      }}
    >
      <div className="f-top">
        <div className="f-left">
          <p className="f-location">{f.location}</p>
          {f.location_description && (
            <p className="f-desc">{f.location_description}</p>
          )}
          <div className="tags">
            {f.is_bottle_filler && <span className="tag bottle">Bottle filler</span>}
            {f.status !== "ON" && <span className="tag status">{f.status}</span>}
            <span className="tag tested">{lastTestedLabel(f)}</span>
          </div>
        </div>
        <div className="f-right">
          <SafetyBadge level={f.safety_level} fountain={f} />
          <span className="f-chevron">›</span>
        </div>
      </div>
      <p className={`rec ${f.safety_level}`}>{f.recommendation}</p>
    </div>
  );
}
