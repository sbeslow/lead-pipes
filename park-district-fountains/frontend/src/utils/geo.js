export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rad(deg) {
  return (deg * Math.PI) / 180;
}

export function metersToMiles(m) {
  const mi = m / 1609.344;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(2)} mi`;
}

export const HALF_MILE_METERS = 804.672;
export const SAFETY_RANK = { danger: 0, caution: 1, safe: 2, unknown: 3 };
