import { useState, useEffect } from "react";
import ParkCard from "../components/ParkCard";
import { haversine, HALF_MILE_METERS, SAFETY_RANK } from "../utils/geo";
import { useData } from "../DataContext";

export default function NearMe() {
  const { parks } = useData();
  const [nearbyParks, setNearbyParks] = useState(null);
  const [status, setStatus] = useState("locating"); // locating | done | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!parks) return;
    if (!navigator.geolocation) {
      setErrorMsg("Your browser doesn't support geolocation.");
      setStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearby = [];
        for (const park of parks) {
          if (park.lat == null || park.lng == null) continue;
          const dist = haversine(latitude, longitude, park.lat, park.lng);
          if (dist > HALF_MILE_METERS) continue;
          nearby.push({ park, dist });
        }
        nearby.sort((a, b) => {
          const ra = SAFETY_RANK[a.park.safety_level];
          const rb = SAFETY_RANK[b.park.safety_level];
          return ra !== rb ? ra - rb : a.dist - b.dist;
        });
        setNearbyParks(nearby);
        setStatus("done");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMsg("Location access was denied. Please allow location access and reload.");
        } else {
          setErrorMsg("Could not get your location. Please try again.");
        }
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [parks]);

  if (status === "locating") {
    return (
      <div id="loading-screen">
        <div className="spinner" />
        <p>Finding your location…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div id="error-screen">
        <p id="error-msg">{errorMsg}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  return (
    <div>
      <p id="results-summary">
        {nearbyParks.length === 0
          ? "No park fountains found within a half mile."
          : `${nearbyParks.length} park${nearbyParks.length !== 1 ? "s" : ""} within ½ mile`}
      </p>
      {nearbyParks.map(({ park, dist }) => (
        <ParkCard key={park.park_id} park={park} dist={dist} />
      ))}
    </div>
  );
}
