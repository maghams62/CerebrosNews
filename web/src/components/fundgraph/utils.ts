export function relativeTimeFromIso(iso: string, nowMs = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "now";

  const diffMs = nowMs - date.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
