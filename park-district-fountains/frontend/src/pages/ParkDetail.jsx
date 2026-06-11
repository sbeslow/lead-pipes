import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SafetyBadge from "../components/SafetyBadge";
import FountainRow from "../components/FountainRow";
import ParkMap from "../components/ParkMap";
import { parkSummaryText } from "../utils/formatters";
import { SAFETY_RANK, haversine } from "../utils/geo";
import { useData } from "../DataContext";

export default function ParkDetail() {
  const { parkId } = useParams();
  const { parks } = useData();
  const navigate = useNavigate();
  const [userPos, setUserPos] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const park = parks.find((p) => p.park_id === parkId);
  if (!park) {
    return <p style={{ padding: 20 }}>Park not found.</p>;
  }

  const summary = parkSummaryText(park);
  const outdoor = park.fountains.filter((f) => f.type === "outdoor");
  const indoor = park.fountains.filter((f) => f.type !== "outdoor");
  const unmapped = park.fountains.filter((f) => f.lat == null);

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

      {park.lat != null && (
        <ParkMap park={park} fountains={park.fountains} userPos={userPos} />
      )}

      {unmapped.length > 0 && (
        <div id="unmapped-section">
          <p className="group-label">
            Not on the map yet ({unmapped.length})
          </p>
          {unmapped.map((f) => (
            <div
              key={f.fountain_id}
              className="unmapped-row"
              onClick={() => navigate(`/fountains/${f.fountain_id}`)}
            >
              <span className="unmapped-name">{f.location}</span>
              <span className="unmapped-cta">Tap to help locate →</span>
            </div>
          ))}
        </div>
      )}

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
