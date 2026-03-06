"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TrendingNewsItem } from "@/components/fundgraph/forYouTypes";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";

function trustTone(value: number): string {
  if (value >= 0.72) return "bg-emerald-100 text-emerald-700";
  if (value >= 0.52) return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

export function TrendingNewsPanel({ items }: { items: TrendingNewsItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => (showAll ? items : items.slice(0, 6)), [items, showAll]);
  const hiddenCount = Math.max(0, items.length - 6);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Trending News</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Market-moving claims</h2>
        </div>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showAll ? "Collapse" : `View all (+${hiddenCount})`}
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {visible.length ? (
          visible.map((item) => (
            <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:bg-white">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trustTone(item.trustWeight)}`}>
                  Trust {Math.round(item.trustWeight * 100)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">“{item.snippet}”</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{item.sourceTitle}</span>
                <span>{relativeTimeFromIso(item.createdAt)}</span>
                <span>Rank {Math.round(item.score * 100)}</span>
                {item.watchlistOverlapWeight > 0 ? <span className="font-semibold text-emerald-700">Watchlist overlap</span> : null}
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No news items in the selected window.
          </div>
        )}
      </div>
    </section>
  );
}
