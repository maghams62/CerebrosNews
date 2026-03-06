"use client";

import Link from "next/link";
import { ThemeDriverRow } from "@/components/fundgraph/forYouTypes";

function deltaTone(delta: number): string {
  if (delta > 0) return "bg-emerald-100 text-emerald-700";
  if (delta < 0) return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export function ThemeDriversPanel({ items }: { items: ThemeDriverRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Market Drivers</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Highest-impact themes</h2>
        </div>
        <Link
          href="/cerebrosfund/signals"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Theme pages
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <Link key={item.slug} href={item.graphHref} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.theme}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${deltaTone(item.trendDelta)}`}>
                  {item.trendDelta >= 0 ? "+" : ""}
                  {item.trendDelta}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>Support {item.supportCount}</span>
                <span>Contested {item.contestedCount}</span>
                <span>Score {item.score}</span>
                <span>{Math.round(item.confidence * 100)}% conf</span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-slate-600">{item.graphQuery}</p>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
            Theme drivers will appear as new signals arrive.
          </div>
        )}
      </div>
    </section>
  );
}
