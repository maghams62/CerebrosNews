import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/fundgraph/service";
import { getProfile } from "@/lib/fundgraph/store";
import { UserProfile } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLimit(raw: string | null, fallback = 10): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function parseRisk(raw: string | null): UserProfile["riskTolerance"] {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "medium";
}

function parseCheckSize(raw: string | null, unit: "m" | "k" = "m"): number {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  const inMillions = unit === "k" ? parsed / 1000 : parsed;
  return Math.max(0.05, Math.min(200, Number(inMillions.toFixed(2))));
}

function coerceStageList(values: string[]): UserProfile["stageFocus"] {
  return values;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") ?? "demo").trim();
  const limit = parseLimit(url.searchParams.get("limit"), 10);

  const persistedProfile = await getProfile(userId);
  const queryProfile: Partial<UserProfile> = {
    userId,
    sectorFocus: parseList(url.searchParams.get("sector")),
    stageFocus: coerceStageList(parseList(url.searchParams.get("stage"))),
    geographies: parseList(url.searchParams.get("geo")),
    riskTolerance: parseRisk(url.searchParams.get("risk")),
    typicalCheckSizeM: url.searchParams.has("checkSizeM")
      ? parseCheckSize(url.searchParams.get("checkSizeM"), "m")
      : parseCheckSize(url.searchParams.get("checkSizeK"), "k"),
  };

  const hasQueryOverrides =
    Boolean(queryProfile.sectorFocus?.length) ||
    Boolean(queryProfile.stageFocus?.length) ||
    Boolean(queryProfile.geographies?.length) ||
    url.searchParams.has("risk") ||
    url.searchParams.has("checkSizeM") ||
    url.searchParams.has("checkSizeK");

  const effectiveProfile = hasQueryOverrides ? { ...persistedProfile, ...queryProfile } : persistedProfile ?? queryProfile;
  const response = await getRecommendations(effectiveProfile, { limit });

  return NextResponse.json({
    mode: response.mode,
    userId,
    profile: response.profile,
    recommendations: response.recommendations,
    realModePlaceholder: response.mode === "real",
  });
}
