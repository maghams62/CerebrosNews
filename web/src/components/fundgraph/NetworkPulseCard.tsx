"use client";

import Link from "next/link";
import { NetworkPulseSnapshot } from "@/components/fundgraph/forYouTypes";

function toneClass(tone: "positive" | "warning" | "neutral"): string {
  if (tone === "positive") return "text-emerald-700";
  if (tone === "warning") return "text-rose-700";
  return "text-slate-700";
}

export function NetworkPulseCard({ snapshot }: { snapshot: NetworkPulseSnapshot }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Network Pulse</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Graph relationship movement</h2>
        </div>
        <Link
          href={snapshot.expandHref}
          className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Expand Graph
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Strong links 24h</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">{snapshot.newStrongLinks24h}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Contested 72h</div>
          <div className="mt-1 text-lg font-semibold text-rose-700">{snapshot.contestedLinks72h}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Bridge driver</div>
          <div className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{snapshot.bridgeDriver}</div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {snapshot.topEdgeSnippets.slice(0, 3).map((entry) => (
          <Link key={entry.id} href={entry.href} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <span className={`mt-0.5 text-xs font-semibold ${toneClass(entry.tone)}`}>•</span>
            <span className="line-clamp-1 text-xs text-slate-700">{entry.text}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
