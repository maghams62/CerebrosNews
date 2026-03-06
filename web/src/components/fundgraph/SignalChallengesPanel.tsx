"use client";

import { SignalReport } from "@/components/fundgraph/signalReportTypes";

export function SignalChallengesPanel({
  challenges,
  onCitationClick,
  onChallenge,
}: {
  challenges: SignalReport["challenges"];
  onCitationClick: (citationId: string) => void;
  onChallenge: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Challenges / Disputes</h3>
        <button
          type="button"
          onClick={onChallenge}
          className="h-8 rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          Challenge this signal
        </button>
      </div>

      {challenges.length ? (
        <div className="mt-3 space-y-3">
          {challenges.slice(0, 2).map((challenge) => (
            <article key={challenge.id} className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-3">
              <p className="text-xs font-semibold text-rose-800">{challenge.challenger_display}</p>
              <p className="mt-1 text-sm text-rose-900">{challenge.claim}</p>
              <p className="mt-2 text-xs text-rose-700">
                Impact: {challenge.impact.score_delta} score
                {challenge.impact.confidence_change ? ` · ${challenge.impact.confidence_change}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {challenge.citations.map((citationId) => (
                  <button
                    key={`${challenge.id}-${citationId}`}
                    type="button"
                    onClick={() => onCitationClick(citationId)}
                    className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    {citationId}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
          No active disputes. Submit a structured challenge if you have contradictory evidence.
        </div>
      )}
    </section>
  );
}
