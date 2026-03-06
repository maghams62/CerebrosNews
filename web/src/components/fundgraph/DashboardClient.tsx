"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditsHowItWorksCard } from "@/components/fundgraph/CreditsHowItWorksCard";
import { ForYouPage } from "@/components/fundgraph/ForYouPage";
import { claimMatchesUserProfile, listProfileFilterChips, profileHasActiveSignalFeedFilters, signalMatchesUserProfile } from "@/fundgraph/profilePreferences";
import { useFundGraphState } from "@/fundgraph/state";
import { getRecommendations } from "@/lib/fundgraph/client";
import { Fund, NewsClaim, Signal } from "@/fundgraph/types";

export function DashboardClient({
  funds,
  signals,
  claims,
  initialRecommendations,
  referenceNowMs,
}: {
  funds: Fund[];
  signals: Signal[];
  claims: NewsClaim[];
  initialRecommendations: Array<{ fund: Fund; score: number; reason: string }>;
  referenceNowMs: number;
}) {
  const { userId, profilePreferences } = useFundGraphState();
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [showCreditsGuide, setShowCreditsGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await getRecommendations(userId, 8);
        if (cancelled || !Array.isArray(response.recommendations)) return;
        setRecommendations(
          response.recommendations
            .map((entry) => ({
              fund: entry.fund,
              score: entry.score,
              reason: entry.reason,
            }))
            .filter((entry) => Boolean(entry.fund))
        );
      } catch {
        // Keep server-provided recommendations if live fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fundById = useMemo(
    () =>
      Object.fromEntries(
        funds.map((fund) => [fund.id, fund])
      ),
    [funds]
  );
  const hasProfileFilters = useMemo(
    () => profileHasActiveSignalFeedFilters(profilePreferences),
    [profilePreferences]
  );
  const profileFilterChips = useMemo(() => listProfileFilterChips(profilePreferences), [profilePreferences]);

  const filteredSignals = useMemo(() => {
    if (!hasProfileFilters) return signals;
    const filtered = signals.filter((signal) => signalMatchesUserProfile(signal, fundById, profilePreferences));
    return filtered.length ? filtered : signals;
  }, [fundById, hasProfileFilters, profilePreferences, signals]);

  const filteredClaims = useMemo(() => {
    if (!hasProfileFilters) return claims;
    const filtered = claims.filter((claim) => claimMatchesUserProfile(claim, fundById, profilePreferences));
    return filtered.length ? filtered : claims;
  }, [claims, fundById, hasProfileFilters, profilePreferences]);

  const profileFilterApplied = useMemo(
    () => hasProfileFilters && (filteredSignals.length < signals.length || filteredClaims.length < claims.length),
    [claims.length, filteredClaims.length, filteredSignals.length, hasProfileFilters, signals.length]
  );

  return (
    <>
      <ForYouPage
        funds={funds}
        signals={filteredSignals}
        claims={filteredClaims}
        recommendations={recommendations}
        referenceNowMs={referenceNowMs}
        profileFilterApplied={profileFilterApplied}
        profileFilterChips={profileFilterChips}
        onOpenCreditsGuide={() => setShowCreditsGuide(true)}
      />

      {showCreditsGuide ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowCreditsGuide(false)} aria-hidden="true" />
          <div className="absolute inset-x-4 top-8 bottom-8 mx-auto max-w-5xl overflow-y-auto">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreditsGuide(false)}
                className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <CreditsHowItWorksCard showLearnMore={false} />
          </div>
        </div>
      ) : null}
    </>
  );
}
