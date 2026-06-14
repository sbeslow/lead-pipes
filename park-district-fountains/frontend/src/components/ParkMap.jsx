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

const LABELS = { safe: "Safe", caution: "Caution", danger: "Do not drink", unknown: "No data" };

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

function fountainPopupHtml(f, color) {
  return `<div class="map-popup">
    <div class="map-popup-top">
      <span class="map-popup-dot" style="background:${color}"></span>
      <span class="map-popup-name">${f.location}</span>
    </div>
    <p class="map-popup-rec">${f.recommendation || LABELS[f.safety_level] || ""}</p>
    <a class="map-popup-link" data-fid="${f.fountain_id}" href="/fountains/${f.fountain_id}">View details →</a>
  </div>`;
}

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

// Flat-earth point-to-segment distance in meters (accurate enough for <100m distances)
const M_PER_DEG_LAT = 111319;
function distToSegmentMeters(plat, plng, alat, alng, blat, blng) {
  const cos = Math.cos((plat * Math.PI) / 180);
  const py = plat * M_PER_DEG_LAT,  px = plng * M_PER_DEG_LAT * cos;
  const ay = alat * M_PER_DEG_LAT,  ax = alng * M_PER_DEG_LAT * cos;
  const by = blat * M_PER_DEG_LAT,  bx = blng * M_PER_DEG_LAT * cos;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2);
}

// True if the point is within bufferMeters of any edge of the feature boundary
function isNearBoundary(lat, lng, feature, bufferMeters) {
  const { type, coordinates } = feature.geometry;
  const rings = type === "Polygon" ? coordinates : coordinates.flat(1);
  return rings.some((ring) =>
    ring.some((_, i) => {
      if (i === 0) return false;
      const [alng, alat] = ring[i - 1], [blng, blat] = ring[i];
      return distToSegmentMeters(lat, lng, alat, alng, blat, blng) <= bufferMeters;
    })
  );
}

const BORDER_BUFFER_METERS = 4.572; // 15 feet

export default function ParkMap({ park, fountains, userPos, onInsideChange }) {
  const navigate = useNavigate();
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const userMarkerRef = useRef(null);
  const boundaryRef   = useRef(null);
  const featureRef    = useRef(null);
  const isInsideRef   = useRef(null);

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
      const color = COLORS[f.safety_level] ?? COLORS.unknown;
      L.marker([f.lat, f.lng], { icon: markerIcon(color) })
        .addTo(map)
        .bindPopup(fountainPopupHtml(f, color), { maxWidth: 240, closeButton: false });
    }

    // SPA navigation for popup "View details" links
    map.on("popupopen", (e) => {
      const link = e.popup.getElement()?.querySelector(".map-popup-link");
      if (link) {
        link.addEventListener("click", (evt) => {
          evt.preventDefault();
          navigate(`/fountains/${link.dataset.fid}`);
        });
      }
    });

    mapRef.current = map;

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
      .catch(() => {});

    return () => {
      map.remove();
      mapRef.current        = null;
      userMarkerRef.current = null;
      boundaryRef.current   = null;
      featureRef.current    = null;
      isInsideRef.current   = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park.park_id]);

  // Update user dot and inside/outside state — no auto-pan
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

      const feature = featureRef.current;
      const inside = feature
        ? (isPointInFeature(userPos.lat, userPos.lng, feature) ||
           isNearBoundary(userPos.lat, userPos.lng, feature, BORDER_BUFFER_METERS))
        : false;

      if (inside !== isInsideRef.current) {
        isInsideRef.current = inside;
        onInsideChange?.(inside);
      }

      if (boundaryRef.current) {
        boundaryRef.current.setStyle(inside ? BOUNDARY_INSIDE : BOUNDARY_OUTSIDE);
      }
    } else {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    }
  }, [userPos]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRecenter() {
    const map = mapRef.current;
    if (!map) return;
    if (boundaryRef.current) {
      map.closePopup();
      map.fitBounds(boundaryRef.current.getBounds(), { padding: [24, 24] });
    } else {
      map.setView([park.lat, park.lng], 16);
    }
  }

  return (
    <div className="park-map-wrap">
      <div ref={containerRef} id="park-map" />
      <button id="park-map-recenter" onClick={handleRecenter} title="Center on park">
        ⊙ Park
      </button>
    </div>
  );
}
