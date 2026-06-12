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

const BOUNDARY_OUTSIDE = { color: "#64748b", weight: 2, fillColor: "#64748b", fillOpacity: 0.05 };
const BOUNDARY_INSIDE  = { color: "#3b82f6", weight: 2.5, fillColor: "#3b82f6", fillOpacity: 0.10 };

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
    if (group.length === 1) { result.push({ ...group[0] }); continue; }
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

// Ray-casting point-in-polygon; ring is [[lng, lat], …] (GeoJSON order)
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function isPointInFeature(lat, lng, feature) {
  const { type, coordinates } = feature.geometry;
  const rings = type === "Polygon" ? coordinates : coordinates.flat(1);
  return rings.some((ring) => pointInRing(lat, lng, ring));
}

export default function ParkMap({ park, fountains, userPos, onInsideChange }) {
  const navigate = useNavigate();
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const userMarkerRef = useRef(null);
  const boundaryRef   = useRef(null);   // L.geoJSON layer
  const featureRef    = useRef(null);   // raw GeoJSON feature for pip
  const isInsideRef   = useRef(null);   // null = unknown yet

  // Create map + boundary once per park
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

    // Fetch park boundaries and add the matching outline
    const parkNo = parseInt(park.park_id, 10);
    fetch("/park_boundaries.geojson")
      .then((r) => r.json())
      .then(({ features }) => {
        const feature = features.find((f) => f.properties.PARK_NO === parkNo);
        if (!feature || !mapRef.current) return;

        featureRef.current = feature;
        const layer = L.geoJSON(feature, { style: BOUNDARY_OUTSIDE }).addTo(mapRef.current);
        boundaryRef.current = layer;
        mapRef.current.fitBounds(layer.getBounds(), { padding: [24, 24] });
      })
      .catch(() => {}); // silently ignore if file not available

    return () => {
      map.remove();
      mapRef.current    = null;
      userMarkerRef.current = null;
      boundaryRef.current   = null;
      featureRef.current    = null;
      isInsideRef.current   = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park.park_id]);

  // Update user dot and inside/outside state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userPos) {
      // Update marker
      const latlng = [userPos.lat, userPos.lng];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(latlng);
      } else {
        userMarkerRef.current = L.marker(latlng, { icon: userIcon }).addTo(map);
      }

      // Inside/outside detection
      const feature = featureRef.current;
      const inside = feature ? isPointInFeature(userPos.lat, userPos.lng, feature) : false;

      if (inside !== isInsideRef.current) {
        isInsideRef.current = inside;
        onInsideChange?.(inside);
      }

      // Update boundary color and map view
      if (boundaryRef.current) {
        boundaryRef.current.setStyle(inside ? BOUNDARY_INSIDE : BOUNDARY_OUTSIDE);
      }
      if (inside) {
        map.setView(latlng, 18);
      } else if (boundaryRef.current) {
        map.fitBounds(boundaryRef.current.getBounds(), { padding: [24, 24] });
      }
    } else {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    }
  }, [userPos]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} id="park-map" />;
}
