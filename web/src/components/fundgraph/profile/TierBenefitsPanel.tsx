"use client";

import { getNextTier, LIMITS_BY_TIER, tierLabel, Tier } from "@/lib/fundgraph/gamification.shared";

function formatLimit(value: number): string {
  return value >= 9999 ? "Full" : String(value);
}

export function TierBenefitsPanel({
  tier,
}: {
  tier: Tier;
}) {
  const currentLimits = LIMITS_BY_TIER[tier];
  const nextTier = getNextTier(tier);
  const nextLimits = nextTier ? LIMITS_BY_TIER[nextTier] : null;

  return (
    <section id="tier-benefits" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Tier Benefits Breakdown</h2>
      <p className="mt-1 text-sm text-slate-600">Current benefits and what unlocks at the next tier.</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Current: {tierLabel(tier)}</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            <li>Claims visible: {formatLimit(currentLimits.maxClaimsVisible)}</li>
            <li>Signals visible: {formatLimit(currentLimits.maxSignalsVisible)}</li>
            <li>Graph depth: {currentLimits.graphDepth}</li>
            <li>Memo access: {currentLimits.memoAllowed ? "Yes" : "No"}</li>
            <li>Early signals: {currentLimits.earlySignals ? "Yes" : "No"}</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
            {nextTier ? `Next: ${tierLabel(nextTier)}` : "Top tier reached"}
          </p>
          {nextLimits ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              <li>Claims visible: {formatLimit(nextLimits.maxClaimsVisible)}</li>
              <li>Signals visible: {formatLimit(nextLimits.maxSignalsVisible)}</li>
              <li>Graph depth: {nextLimits.graphDepth}</li>
              <li>Memo access: {nextLimits.memoAllowed ? "Yes" : "No"}</li>
              <li>Early signals: {nextLimits.earlySignals ? "Yes" : "No"}</li>
            </ul>
          ) : (
            <p className="mt-2 text-xs text-emerald-700">You already have full tier capabilities enabled.</p>
          )}
        </div>
      </div>
    </section>
  );
}
