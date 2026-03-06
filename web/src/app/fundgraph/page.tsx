import { DashboardClient } from "@/components/fundgraph/DashboardClient";
import { Fund } from "@/fundgraph/types";
import { filterClaimsForDemoMode, filterSignalsForDemoMode } from "@/lib/fundgraph/demoModeFilter";
import { curateSignalsForFeed, sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { getRecommendations } from "@/lib/fundgraph/service";
import { getClaims, getProfile, getSignals } from "@/lib/fundgraph/store";
import { readFunds } from "@/lib/fundgraph/storage";

type DashboardPayload = {
  funds: Awaited<ReturnType<typeof readFunds>>;
  signals: Awaited<ReturnType<typeof getSignals>>;
  claims: Awaited<ReturnType<typeof getClaims>>;
  recommendations: Array<{ fund: Fund; score: number; reason: string }>;
  referenceNowMs: number;
};

const DASHBOARD_CACHE_TTL_MS = 60_000;
let dashboardCache: { expiresAt: number; payload: DashboardPayload } | null = null;

async function loadDashboardPayload(): Promise<DashboardPayload> {
  const now = Date.now();
  if (dashboardCache && dashboardCache.expiresAt > now) {
    return dashboardCache.payload;
  }

  const [funds, signals, claims, profile] = await Promise.all([
    readFunds(),
    getSignals(),
    getClaims(),
    getProfile("demo"),
  ]);
  const filteredSignals = filterSignalsForDemoMode(signals);
  const displaySignals = curateSignalsForFeed(filteredSignals, { maxPerFund: 5, surface: "global" });
  const filteredClaims = await filterClaimsForDemoMode(claims);
  const recResponse = await getRecommendations(profile ?? { userId: "demo" }, { limit: 6 });

  const payload: DashboardPayload = {
    funds: [...funds].map(sanitizeFundForDisplay).sort((a, b) => b.trendScore - a.trendScore),
    signals: displaySignals.slice(0, 96),
    claims: filteredClaims.slice(0, 96),
    recommendations: recResponse.recommendations.map((entry) => ({
      fund: sanitizeFundForDisplay(entry.fund),
      score: entry.score,
      reason: entry.reason,
    })),
    referenceNowMs: now,
  };

  dashboardCache = {
    expiresAt: now + DASHBOARD_CACHE_TTL_MS,
    payload,
  };

  return payload;
}

export default async function FundGraphHomePage() {
  const payload = await loadDashboardPayload();

  return (
    <DashboardClient
      funds={payload.funds}
      signals={payload.signals}
      claims={payload.claims}
      initialRecommendations={payload.recommendations}
      referenceNowMs={payload.referenceNowMs}
    />
  );
}
