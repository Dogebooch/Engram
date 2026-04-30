const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function relativeTime(now: number, then: number): string {
  const delta = now - then;
  if (delta < 0) return "just now";
  if (delta < MIN) return "just now";
  if (delta < HOUR) {
    const m = Math.floor(delta / MIN);
    return `${m}m ago`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return `${h}h ago`;
  }
  if (delta < WEEK) {
    const d = Math.floor(delta / DAY);
    return `${d}d ago`;
  }
  const w = Math.floor(delta / WEEK);
  if (w < 5) return `${w}w ago`;
  const date = new Date(then);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "—";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}
