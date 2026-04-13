import { useParams, useNavigate } from "react-router-dom";
import SafetyBadge from "../components/SafetyBadge";
import FountainRow from "../components/FountainRow";
import { parkSummaryText } from "../utils/formatters";
import { SAFETY_RANK } from "../utils/geo";
import { useData } from "../DataContext";

export default function ParkDetail() {
  const { parkId } = useParams();
  const { parks } = useData();
  const navigate = useNavigate();

  const park = parks.find((p) => p.park_id === parkId);
  if (!park) {
    return <p style={{ padding: 20 }}>Park not found.</p>;
  }

  const summary = parkSummaryText(park);
  const outdoor = park.fountains.filter((f) => f.type === "outdoor");
  const indoor = park.fountains.filter((f) => f.type !== "outdoor");

  function sortedGroup(fountains) {
    return [...fountains].sort(
      (a, b) => SAFETY_RANK[a.safety_level] - SAFETY_RANK[b.safety_level]
    );
  }

  return (
    <div>
      <div id="park-header">
        <div>
          <p id="detail-park-name">{park.park_name}</p>
          <p id="detail-park-address">{park.address}</p>
        </div>
        <SafetyBadge level={park.safety_level} />
      </div>

      {summary && <p id="detail-park-summary">{summary}</p>}

      <div id="detail-fountain-list">
        {outdoor.length > 0 && (
          <>
            <p className="group-label">Outdoor ({outdoor.length})</p>
            {sortedGroup(outdoor).map((f) => (
              <FountainRow key={f.fountain_id} fountain={f} />
            ))}
          </>
        )}
        {indoor.length > 0 && (
          <>
            <p className="group-label">Indoor ({indoor.length})</p>
            {sortedGroup(indoor).map((f) => (
              <FountainRow key={f.fountain_id} fountain={f} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
