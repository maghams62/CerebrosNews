"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { selectConfidenceMovers } from "@/components/fundgraph/forYouMath";
import { ConfidenceMoverRow } from "@/components/fundgraph/forYouTypes";

type FilterMode = "all" | "up" | "down";

function confidenceTone(label: ConfidenceMoverRow["confidence"]): string {
  if (label === "High") return "bg-emerald-100 text-emerald-700";
  if (label === "Medium") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function deltaTone(delta: number): string {
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-rose-700";
  return "text-slate-500";
}

export function ConfidenceMoversPanel({ rows }: { rows: ConfidenceMoverRow[] }) {
  const [mode, setMode] = useState<FilterMode>("all");

  const filtered = useMemo(() => {
    return selectConfidenceMovers(rows, mode);
  }, [mode, rows]);

  const visible = filtered.slice(0, 6);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Confidence Movers</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Strongest confidence movement</h2>
        </div>

        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
          {(["all", "up", "down"] as FilterMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full px-3 py-1 ${
                mode === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item === "all" ? "All" : item === "up" ? "Up" : "Down"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {visible.length ? (
          visible.map((item) => (
            <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{item.fundName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${confidenceTone(item.confidence)}`}>
                    {item.confidence}
                  </span>
                  <span className={`text-xs font-semibold ${deltaTone(item.delta)}`}>
                    {item.direction === "up" ? "↑" : "↓"} {item.delta >= 0 ? "+" : ""}
                    {item.delta}
                  </span>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No movers found for this filter.
          </div>
        )}
      </div>
    </section>
  );
}
