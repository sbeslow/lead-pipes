import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";

// Suppress Leaflet's broken default icon path in bundlers
delete L.Icon.Default.prototype._getIconUrl;

const COLORS = {
  safe:    "#16a34a",
  caution: "#d97706",
  danger:  "#dc2626",
  unknown: "#64748b",
};

function markerIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="f-marker" style="background:${color}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: `<div class="u-dot"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function spreadCollocated(fountains) {
  const grouped = new Map();
  for (const f of fountains) {
    const key = `${f.lat},${f.lng}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  }
  const result = [];
  for (const group of grouped.values()) {
    if (group.length === 1) {
      result.push({ ...group[0] });
      continue;
    }
    const r = 0.00008;
    group.forEach((f, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result.push({ ...f, lat: f.lat + r * Math.cos(angle), lng: f.lng + r * Math.sin(angle) });
    });
  }
  return result;
}

function BoundsController({ mapped, userPos, parkCenter }) {
  const map = useMap();

  useEffect(() => {
    const points = mapped.map((f) => [f.lat, f.lng]);
    if (userPos) points.push([userPos.lat, userPos.lng]);

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 18 });
    } else {
      map.setView([parkCenter.lat, parkCenter.lng], 16);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  return null;
}

export default function ParkMap({ park, fountains, userPos }) {
  const navigate = useNavigate();

  const mapped = spreadCollocated(
    fountains.filter((f) => f.lat != null && f.lng != null)
  );

  const center = [park.lat, park.lng];

  return (
    <MapContainer
      id="park-map"
      center={center}
      zoom={16}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

      <BoundsController mapped={mapped} userPos={userPos} parkCenter={{ lat: park.lat, lng: park.lng }} />

      {mapped.map((f) => (
        <Marker
          key={f.fountain_id}
          position={[f.lat, f.lng]}
          icon={markerIcon(COLORS[f.safety_level] ?? COLORS.unknown)}
          eventHandlers={{ click: () => navigate(`/fountains/${f.fountain_id}`) }}
        />
      ))}

      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} />
      )}
    </MapContainer>
  );
}
