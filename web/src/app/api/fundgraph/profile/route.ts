import { NextResponse } from "next/server";
import { z } from "zod";
import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { getGamificationUser } from "@/lib/fundgraph/gamification";
import { getRecommendations } from "@/lib/fundgraph/service";
import { ensureUser, getProfile, getUserById, upsertProfile } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

const profileSchema = z.object({
  userId: z.string().trim().min(1),
  sectorFocus: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  stageFocus: z.array(z.string().trim().min(1).max(32)).max(30).default([]),
  geographies: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  riskTolerance: z.enum(["low", "medium", "high"]).default("medium"),
  checkSizeMinM: z.number().min(0.05).max(200).optional(),
  checkSizeMaxM: z.number().min(0.05).max(200).optional(),
  typicalCheckSizeM: z.number().min(0.05).max(200).optional(),
  thesisKeywords: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
});

function parseLimit(value: string | null, fallback = 5): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") ?? "").trim();
  const includeRecommendations = parseBoolean(url.searchParams.get("includeRecommendations"), true);
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  const profile = await getProfile(userId);
  const gamification = await getGamificationUser(userId);
  const user = {
    id: userId,
    name: userId,
    credScore: gamification.credits,
    badgeTier: gamification.tier.toUpperCase(),
  };

  if (!profile) {
    return NextResponse.json({
      mode: getFundgraphDataMode(),
      userId,
      profile: null,
      cred: gamification.credits,
      user,
    });
  }

  const recommendations = includeRecommendations
    ? await getRecommendations(profile, { limit: parseLimit(url.searchParams.get("limit"), 5) })
    : null;

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    userId,
    profile,
    cred: gamification.credits,
    user,
    ...(includeRecommendations ? { recommendations: recommendations?.recommendations ?? [] } : {}),
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}

export async function POST(req: Request) {
  const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const fallbackTypical = parsed.data.typicalCheckSizeM ?? 1;
  const minFromInput = parsed.data.checkSizeMinM ?? Math.max(0.05, Number((fallbackTypical * 0.6).toFixed(2)));
  const maxFromInput = parsed.data.checkSizeMaxM ?? Math.max(0.1, Number((fallbackTypical * 1.8).toFixed(2)));
  const checkSizeMinM = Math.max(0.05, Number(minFromInput.toFixed(2)));
  const checkSizeMaxM = Math.max(checkSizeMinM, Number(maxFromInput.toFixed(2)));
  const typicalRaw = parsed.data.typicalCheckSizeM ?? (checkSizeMinM + checkSizeMaxM) / 2;
  const typicalCheckSizeM = Math.max(checkSizeMinM, Math.min(checkSizeMaxM, Number(typicalRaw.toFixed(2))));

  const stored = await upsertProfile({
    userId: parsed.data.userId,
    sectorFocus: parsed.data.sectorFocus,
    stageFocus: parsed.data.stageFocus,
    geographyFocus: parsed.data.geographies,
    geographies: parsed.data.geographies,
    riskTolerance: parsed.data.riskTolerance,
    checkSizeMinM,
    checkSizeMaxM,
    typicalCheckSizeM,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typicalCheckSizeM * 1000)),
    thesisKeywords: parsed.data.thesisKeywords ?? [],
  });

  await ensureUser(parsed.data.userId);
  const user = await getUserById(parsed.data.userId);
  const recommendations = await getRecommendations(stored, { limit: 5 });

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    profile: stored,
    user: user
      ? {
          id: user.id,
          name: user.name,
          credScore: user.credScore,
          badgeTier: user.badgeTier,
        }
      : null,
    recommendations: recommendations.recommendations,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
