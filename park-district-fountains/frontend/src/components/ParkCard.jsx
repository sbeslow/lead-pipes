import { useNavigate } from "react-router-dom";
import SafetyBadge from "./SafetyBadge";
import { metersToMiles } from "../utils/geo";
import { parkSummaryText } from "../utils/formatters";

export default function ParkCard({ park, dist }) {
  const navigate = useNavigate();
  const activeFountains = park.fountains.filter((f) => f.safety_level !== "unknown");
  const fixtureCount = activeFountains.length || park.total_fixture_count;
  const summary = parkSummaryText(park);

  return (
    <div
      className="park-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/parks/${park.park_id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(`/parks/${park.park_id}`);
      }}
    >
      <div className="park-card-top">
        <div>
          <p className="park-card-name">{park.park_name}</p>
          <p className="park-card-meta">
            {fixtureCount} fixture{fixtureCount !== 1 ? "s" : ""}
            {dist != null && ` · ${metersToMiles(dist)}`}
          </p>
        </div>
        <SafetyBadge level={park.safety_level} untestedCount={park.untested_count} />
      </div>
      <p className="park-card-address">{park.address}</p>
      {summary && <p className="park-card-summary">{summary}</p>}
    </div>
  );
}
