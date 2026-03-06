import { UserProfile } from "@/fundgraph/types";
import { ProfileActivityResponse } from "@/lib/fundgraph/client";

function titleCase(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}

export function formatMillions(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function toNaturalList(values: string[]): string {
  if (!values.length) return "";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} + ${values[1]}`;
  return `${values[0]}, ${values[1]} + ${values.length - 2} more`;
}

export function buildPreferenceNarrative(profile: UserProfile | null | undefined): string {
  if (!profile) {
    return "No saved preference profile yet. Add your sector, stage, and geography priorities to personalize outputs.";
  }

  const sectors = profile.sectorFocus.length ? toNaturalList(profile.sectorFocus.slice(0, 4)) : "broad sectors";
  const stages = profile.stageFocus.length ? toNaturalList(profile.stageFocus.slice(0, 4)) : "multi-stage";
  const geos = profile.geographies.length ? toNaturalList(profile.geographies.slice(0, 4)) : "global coverage";
  const risk = titleCase(profile.riskTolerance);
  const minCheck = formatMillions(profile.checkSizeMinM);
  const maxCheck = formatMillions(profile.checkSizeMaxM);

  return `You currently bias toward ${stages} opportunities in ${sectors} across ${geos}, with ${risk} risk tolerance and $${minCheck}M-$${maxCheck}M check range.`;
}

export function relativeTimeFromIso(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  const elapsedMs = Date.now() - date.getTime();
  if (elapsedMs <= 0) return "just now";
  const minutes = Math.floor(elapsedMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function contributionLabel(type: ProfileActivityResponse["recent"]["contributionEvents"][number]["type"]): string {
  if (type === "add_signal") return "Published signal";
  if (type === "verify_claim") return "Verified claim";
  if (type === "add_source") return "Added citation";
  if (type === "add_comment") return "Added comment";
  if (type === "share_signal") return "Shared signal";
  if (type === "upvote") return "Submitted stance";
  if (type === "memo_generate") return "Generated memo";
  return type;
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
