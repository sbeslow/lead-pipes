import { useEffect, useRef } from "react";
import L from "leaflet";
import { useNavigate } from "react-router-dom";

delete L.Icon.Default.prototype._getIconUrl;

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

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
    return { center: [clat, clng], zoom: span < 0.0005 ? 18 : span < 0.002 ? 17 : 16 };
  }
  return { center: [park.lat, park.lng], zoom: 16 };
}

export default function ParkMap({ park, fountains, userPos }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Create map once on mount — never touch viewport again
  useEffect(() => {
    const mapped = spreadCollocated(
      fountains.filter((f) => f.lat != null && f.lng != null)
    );
    const { center, zoom } = parkInitialView(mapped, park);

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(TILE_URL).addTo(map);

    for (const f of mapped) {
      L.marker([f.lat, f.lng], { icon: markerIcon(COLORS[f.safety_level] ?? COLORS.unknown) })
        .addTo(map)
        .on("click", () => navigate(`/fountains/${f.fountain_id}`));
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park.park_id]);

  // Update user dot without moving the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userPos) {
      const latlng = [userPos.lat, userPos.lng];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(latlng);
      } else {
        userMarkerRef.current = L.marker(latlng, { icon: userIcon }).addTo(map);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userPos]);

  return <div ref={containerRef} id="park-map" />;
}
