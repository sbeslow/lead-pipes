import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";

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

function parkInitialView(mapped, park) {
  if (mapped.length > 1) {
    const lats = mapped.map((f) => f.lat);
    const lngs = mapped.map((f) => f.lng);
    const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const clng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const span = Math.max(...lats) - Math.min(...lats);
    const zoom = span < 0.0005 ? 18 : span < 0.002 ? 17 : 16;
    return { center: [clat, clng], zoom };
  }
  return { center: [park.lat, park.lng], zoom: 16 };
}

export default function ParkMap({ park, fountains, userPos }) {
  const navigate = useNavigate();

  const mapped = spreadCollocated(
    fountains.filter((f) => f.lat != null && f.lng != null)
  );

  const { center, zoom } = parkInitialView(mapped, park);

  return (
    <MapContainer
      key={park.park_id}
      id="park-map"
      center={center}
      zoom={zoom}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

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
