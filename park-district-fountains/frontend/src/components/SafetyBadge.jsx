import { badgeLabel, isOffline } from "../utils/formatters";

export default function SafetyBadge({ level, fountain, untestedCount }) {
  if (fountain && isOffline(fountain)) {
    return <span className="safety-badge offline">Offline</span>;
  }
  const label =
    level === "safe" && untestedCount > 0
      ? "Mostly safe, some untested"
      : badgeLabel(level);
  return <span className={`safety-badge ${level}`}>{label}</span>;
}
