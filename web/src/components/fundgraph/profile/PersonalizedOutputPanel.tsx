"use client";

import { ProfileRecommendationsList, ProfileRecommendationCard } from "@/components/fundgraph/profile/ProfileRecommendationsList";

export function PersonalizedOutputPanel({
  profileChips,
  recommendations,
  refreshing,
  onRefresh,
  onSaveTopThree,
  onGenerateMemo,
  canGenerateMemo,
  memoLockedLabel,
  isFundSaved,
  onSaveFund,
}: {
  profileChips: string[];
  recommendations: ProfileRecommendationCard[];
  refreshing: boolean;
  onRefresh: () => void;
  onSaveTopThree: () => void;
  onGenerateMemo: () => void;
  canGenerateMemo: boolean;
  memoLockedLabel: string | null;
  isFundSaved: (fundId: string) => boolean;
  onSaveFund: (fundId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Personalized Output</h2>
          <p className="mt-1 text-sm text-slate-600">Recommendation engine output based on your saved LP profile.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh output"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {profileChips.length ? (
          profileChips.slice(0, 8).map((chip) => (
            <span key={chip} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              {chip}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">Save preference tags to improve recommendation fit.</span>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Why these recommendations exist: profile alignment across sector, stage, geography, risk, and check-size range.
      </p>

      <div className="mt-4">
        <ProfileRecommendationsList recommendations={recommendations} isFundSaved={isFundSaved} onSaveFund={onSaveFund} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSaveTopThree}
          className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Save top 3 to shortlist
        </button>
        <button
          type="button"
          onClick={onGenerateMemo}
          disabled={!canGenerateMemo}
          className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Generate memo on top pick
        </button>
      </div>
      {memoLockedLabel ? <p className="mt-2 text-xs text-rose-700">{memoLockedLabel}</p> : null}
    </section>
  );
}
