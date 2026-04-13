import { badgeLabel, isOffline } from "../utils/formatters";

export default function SafetyBadge({ level, fountain }) {
  if (fountain && isOffline(fountain)) {
    return <span className="safety-badge offline">Offline</span>;
  }
  return <span className={`safety-badge ${level}`}>{badgeLabel(level)}</span>;
}
