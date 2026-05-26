export function badgeLabel(level) {
  return (
    { safe: "Safe", caution: "Caution", danger: "Do not drink", unknown: "No data" }[
      level
    ] || level
  );
}

export function formatPpb(ppb, belowDetection) {
  if (ppb == null) return "—";
  return belowDetection ? `< ${ppb} ppb` : `${ppb} ppb`;
}

export function isOffline(f) {
  return ["OFF", "REMOVED", "DOES NOT EXIST"].includes(f.status.toUpperCase());
}

export function lastTestedLabel(f, short = false) {
  if (f.tested_2025) return short ? "2025" : "Tested in 2025";
  const recent = f.test_history && f.test_history.find((t) => t.date);
  if (recent) {
    const year = recent.date.slice(0, 4);
    return short ? year : `Last tested ${year}`;
  }
  return short ? "Never" : "Never tested";
}

export function parkSummaryText(park) {
  return park.summary || null;
}
