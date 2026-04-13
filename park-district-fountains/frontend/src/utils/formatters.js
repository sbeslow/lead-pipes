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
  const fc = park.fountain_counts;
  if (!fc) return null;
  const out = fc.outdoor,
    inn = fc.indoor;
  const totalSafe = out.safe + inn.safe;
  const totalCaution = out.caution + inn.caution;
  const totalDanger = out.danger + inn.danger;
  const totalUnknown = out.unknown + inn.unknown;
  const outTested = out.safe + out.caution + out.danger;
  const outdoorAllSafe = outTested > 0 && out.caution === 0 && out.danger === 0;

  if (totalDanger === 0 && totalCaution === 0 && totalUnknown === 0) {
    return `All ${totalSafe} tested safe`;
  }
  if (outdoorAllSafe && (inn.caution > 0 || inn.danger > 0)) {
    const innIssue =
      inn.danger > 0
        ? `${inn.danger} indoor do not drink`
        : `${inn.caution} indoor caution`;
    const outNote = out.unknown > 0 ? ` · ${out.unknown} outdoor untested` : "";
    return `All outdoor safe${outNote} · ${innIssue}`;
  }
  const parts = [];
  if (totalDanger > 0) parts.push(`${totalDanger} do not drink`);
  if (totalCaution > 0) parts.push(`${totalCaution} caution`);
  if (totalSafe > 0) parts.push(`${totalSafe} safe`);
  if (totalUnknown > 0) parts.push(`${totalUnknown} not yet tested`);
  let text = parts.join(" · ");
  if (totalDanger > 0 || totalCaution > 0) text += " — check your specific fountain";
  else if (totalUnknown > 0) text += " — check your specific fountain if untested";

  const totalOffline = out.offline + inn.offline;
  if (totalOffline > 0) text += ` · ${totalOffline} offline or removed`;
  return text;
}
