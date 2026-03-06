"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TrendingFundItem } from "@/components/fundgraph/forYouTypes";

function formatCheckRange(min: number, max: number): string {
  return `$${min.toFixed(1)}M-$${max.toFixed(0)}M`;
}

function formatAum(aumM: number): string {
  if (!Number.isFinite(aumM) || aumM <= 0) return "N/A";
  return `$${aumM.toLocaleString()}M`;
}

function trendTone(delta: number): string {
  if (delta >= 8) return "bg-emerald-100 text-emerald-700";
  if (delta <= -5) return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function MetricPill({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center ${className}`}>
      <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function TrendingFundsGrid({ items }: { items: TrendingFundItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => (showAll ? items : items.slice(0, 4)), [items, showAll]);
  const hiddenCount = Math.max(0, items.length - 4);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Trending Funds</h2>
          <p className="text-sm text-slate-600">Top drivers and fit context, not generic summaries.</p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showAll ? "Collapse" : `View all (+${hiddenCount})`}
            </button>
          ) : null}
          <Link
            href="/cerebrosfund/funds"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Funds universe
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visible.map((item) => (
          <article
            key={item.fund.id}
            className="h-[392px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-150 hover:shadow-md"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/cerebrosfund/funds/${item.fund.id}`} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-slate-700">
                    {item.fund.name}
                  </Link>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.fund.headquarters}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${trendTone(item.trendDelta)}`}>
                  Trend {item.fund.trendScore} {item.trendDelta >= 0 ? "↑" : "↓"} {item.trendDelta >= 0 ? "+" : ""}
                  {item.trendDelta}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Top drivers</p>
                <ul className="mt-2 space-y-1.5">
                  {item.topDrivers.slice(0, 2).map((driver) => (
                    <li key={driver.id} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span className="line-clamp-2 text-xs font-medium text-slate-700">{driver.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 max-h-[54px] overflow-hidden">
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span key={`${item.fund.id}-tag-${tag}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                      {tag}
                    </span>
                  ))}
                  {item.hiddenTagCount > 0 ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700">
                      +{item.hiddenTagCount}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MetricPill label="AUM" value={formatAum(item.fund.aumM)} />
                  <MetricPill label="Check" value={formatCheckRange(item.fund.checkSizeMinM, item.fund.checkSizeMaxM)} />
                  <MetricPill label="Vintage" value={`${item.fund.vintageYear}`} className="col-span-2 sm:col-span-1" />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
