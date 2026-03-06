"use client";

import Link from "next/link";
import { RiskRadarItem } from "@/components/fundgraph/forYouTypes";

function severityTone(severity: number): string {
  if (severity >= 70) return "bg-rose-100 text-rose-700";
  if (severity >= 45) return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

export function RiskRadarPanel({ items }: { items: RiskRadarItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Risk Radar</div>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Contested signals to review</h2>

      <div className="mt-4 space-y-2">
        {items.length ? (
          items.slice(0, 3).map((item) => (
            <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:bg-white">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${severityTone(item.severity)}`}>
                  Risk {Math.round(item.severity)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.detail}</p>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No elevated contested risk in the selected window.
          </div>
        )}
      </div>
    </section>
  );
}
