"use client";

import Link from "next/link";
import { Fund } from "@/fundgraph/types";

export type ProfileRecommendationCard = {
  fund: Fund;
  score: number;
  fitLabel: "High Fit" | "Medium Fit" | "Watch";
  reasons: string[];
};

export function ProfileRecommendationsList({
  recommendations,
  isFundSaved,
  onSaveFund,
}: {
  recommendations: ProfileRecommendationCard[];
  isFundSaved: (fundId: string) => boolean;
  onSaveFund: (fundId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {recommendations.map((item) => (
        <article key={item.fund.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/cerebrosfund/funds/${item.fund.id}`} className="text-sm font-semibold text-slate-900 hover:text-slate-700">
              {item.fund.name}
            </Link>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                Score {Math.round(item.score)}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                {item.fitLabel}
              </span>
            </div>
          </div>

          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {item.reasons.slice(0, 2).map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSaveFund(item.fund.id)}
              className={`inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold ${
                isFundSaved(item.fund.id)
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isFundSaved(item.fund.id) ? "Saved" : "Save to shortlist"}
            </button>
            <Link
              href={`/cerebrosfund/funds/${item.fund.id}`}
              className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open fund
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
