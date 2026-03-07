"use client";

import Link from "next/link";
import { EmergingOpportunityItem } from "@/components/fundgraph/forYouTypes";
import { SectionHelpTooltip } from "@/components/fundgraph/SectionHelpTooltip";

function bubbleColor(item: EmergingOpportunityItem): { fill: string; ring: string; text: string } {
  const contestedRatio = item.contestedCount / Math.max(1, item.supportCount);
  if (contestedRatio >= 0.45) {
    return { fill: "#fff7ed", ring: "#fb923c", text: "#9a3412" };
  }
  if (item.confidence >= 0.72) {
    return { fill: "#ecfdf5", ring: "#10b981", text: "#065f46" };
  }
  return { fill: "#eff6ff", ring: "#3b82f6", text: "#1e3a8a" };
}

function compactLabel(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    const plain = words.join(" ");
    return plain.length > 18 ? `${plain.slice(0, 17)}…` : plain;
  }
  return `${words.slice(0, 2).join(" ")}…`;
}

function deltaTone(delta: number): string {
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-rose-700";
  return "text-slate-500";
}

export function EmergingOpportunitiesPanel({ items }: { items: EmergingOpportunityItem[] }) {
  const analyzerHref = items[0]?.href || "/cerebrosfund/graph";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Opportunity Scan</div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Emerging opportunities</h2>
            <SectionHelpTooltip text="Surfaces new opportunities so you can quickly open the most promising graph paths." />
          </div>
          <p className="mt-1 text-sm text-slate-600">Bubble size shows support, height shows impact, and horizontal drift shows momentum.</p>
        </div>
        <Link
          href={analyzerHref}
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open Graph Analyzer
        </Link>
      </div>

      {items.length ? (
        <>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="relative h-72 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
              {[20, 40, 60, 80].map((value) => (
                <div
                  key={value}
                  className="pointer-events-none absolute left-3 right-3 border-t border-dashed border-slate-200"
                  style={{ bottom: `${value}%` }}
                  aria-hidden="true"
                />
              ))}

              {items.map((item) => {
                const color = bubbleColor(item);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={`Open graph query: ${item.graphQuery}`}
                    className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-center shadow-sm transition hover:scale-[1.03] hover:shadow"
                    style={{
                      left: `${item.x}%`,
                      top: `${100 - item.y}%`,
                      width: `${item.size}px`,
                      height: `${item.size}px`,
                      backgroundColor: color.fill,
                      borderColor: color.ring,
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-1 flex items-center justify-center px-2 text-[10px] font-semibold leading-tight"
                      style={{ color: color.text }}
                    >
                      {compactLabel(item.label)}
                    </span>
                    <span className="sr-only">{item.graphQuery}</span>
                  </Link>
                );
              })}

              <div className="pointer-events-none absolute inset-x-3 bottom-2 flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>Cooling off</span>
                <span>Momentum rising</span>
              </div>
              <div className="pointer-events-none absolute left-2 top-2 text-[11px] font-medium text-slate-500">Higher impact</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <Link key={`list-${item.id}`} href={item.href} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">{item.graphQuery}</p>
                </div>
                <div className="ml-3 shrink-0 text-right text-xs">
                  <p className="font-semibold text-slate-900">Impact {item.impactScore}</p>
                  <p className={`font-semibold ${deltaTone(item.trendDelta)}`}>
                    {item.trendDelta >= 0 ? "+" : ""}
                    {item.trendDelta} momentum
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
          Opportunities will appear as enough signal and claim activity accumulates.
        </div>
      )}
    </section>
  );
}
