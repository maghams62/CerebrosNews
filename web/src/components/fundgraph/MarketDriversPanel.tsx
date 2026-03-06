"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MarketDriverItem } from "@/components/fundgraph/forYouTypes";

function deltaTone(delta: number): string {
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-rose-700";
  return "text-slate-500";
}

function confidenceBadge(value: number): string {
  if (value >= 0.75) return "bg-emerald-100 text-emerald-700";
  if (value >= 0.58) return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

export function MarketDriversPanel({ items }: { items: MarketDriverItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => (showAll ? items : items.slice(0, 5)), [items, showAll]);
  const hiddenCount = Math.max(0, items.length - 5);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Market Drivers</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Highest-impact themes</h2>
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
        {visible.map((item) => (
          <Link key={item.slug} href={item.href} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:bg-white">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
              <span className={`text-xs font-semibold ${deltaTone(item.delta)}`}>
                {item.direction === "up" ? "↑" : "↓"} {item.delta >= 0 ? "+" : ""}
                {item.delta}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span>Support {item.supportCount}</span>
              <span>Contested {item.contestedCount}</span>
              <span>Score {Math.round(item.driverScore * 100)}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${confidenceBadge(item.avgConfidence)}`}>
                {Math.round(item.avgConfidence * 100)}% conf
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
