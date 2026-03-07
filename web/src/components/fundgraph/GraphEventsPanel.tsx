"use client";

import Link from "next/link";
import { GraphEventItem } from "@/components/fundgraph/forYouTypes";
import { SectionHelpTooltip } from "@/components/fundgraph/SectionHelpTooltip";

function label(kind: GraphEventItem["kind"]): string {
  if (kind === "co-investment") return "Co-investment";
  if (kind === "founder-movement") return "Founder movement";
  return "Network change";
}

export function GraphEventsPanel({ items }: { items: GraphEventItem[] }) {
  const analyzerHref = items[0]?.href || "/cerebrosfund/graph";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Network Pulse</div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Relationship events to investigate</h2>
            <SectionHelpTooltip text="Flags relationship changes so you can investigate important network shifts." />
          </div>
        </div>
        <Link
          href={analyzerHref}
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open Graph Analyzer
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:bg-white">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                <div>
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.text}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-600">{item.graphQuery}</p>
                  <p className="mt-1 text-xs text-slate-500">{label(item.kind)}</p>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
            No relationship movement detected in this window.
          </div>
        )}
      </div>
    </section>
  );
}
