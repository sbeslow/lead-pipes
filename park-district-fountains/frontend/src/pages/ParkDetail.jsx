import { useParams, useNavigate, useEffect, useState } from "react";
import SafetyBadge from "../components/SafetyBadge";
import FountainRow from "../components/FountainRow";
import { parkSummaryText } from "../utils/formatters";
import { SAFETY_RANK, haversine } from "../utils/geo";
import { useData } from "../DataContext";

export default function ParkDetail() {
  const { parkId } = useParams();
  const { parks } = useData();
  const navigate = useNavigate();
  const [userPos, setUserPos] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const park = parks.find((p) => p.park_id === parkId);
  if (!park) {
    return <p style={{ padding: 20 }}>Park not found.</p>;
  }

  const summary = parkSummaryText(park);
  const outdoor = park.fountains.filter((f) => f.type === "outdoor");
  const indoor = park.fountains.filter((f) => f.type !== "outdoor");

  function distTo(f) {
    if (!userPos || f.lat == null) return null;
    return haversine(userPos.lat, userPos.lng, f.lat, f.lng);
  }

  function sortedGroup(fountains) {
    return [...fountains].sort((a, b) => {
      const da = distTo(a);
      const db = distTo(b);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      return SAFETY_RANK[a.safety_level] - SAFETY_RANK[b.safety_level];
    });
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
              <FountainRow key={f.fountain_id} fountain={f} dist={distTo(f)} />
            ))}
          </>
        )}
        {indoor.length > 0 && (
          <>
            <p className="group-label">Indoor ({indoor.length})</p>
            {sortedGroup(indoor).map((f) => (
              <FountainRow key={f.fountain_id} fountain={f} dist={distTo(f)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
