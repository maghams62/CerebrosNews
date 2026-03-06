"use client";

import Link from "next/link";
import { ClaimDebateItem } from "@/components/fundgraph/forYouTypes";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";

function confidenceTone(value: number): string {
  if (value >= 0.72) return "bg-emerald-100 text-emerald-700";
  if (value >= 0.55) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export function ClaimsDebatePanel({ items, referenceNowMs }: { items: ClaimDebateItem[]; referenceNowMs?: number }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Market-Moving Claims</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Debated and emerging</h2>
        </div>
        <Link
          href="/cerebrosfund/claims"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.claim}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-600">{item.graphQuery}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>Support {item.supportCount}</span>
                <span>Contested {item.contestedCount}</span>
                <span>{relativeTimeFromIso(item.createdAt, referenceNowMs)}</span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${confidenceTone(item.confidence)}`}>
                  {Math.round(item.confidence * 100)}% conf
                </span>
                <Link
                  href={item.href}
                  className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Open graph
                </Link>
                <Link
                  href={item.addCitationHref}
                  title="Help the community by adding evidence that supports or disputes this claim."
                  className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Add citation
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
            No claim debates in this window.
          </div>
        )}
      </div>
    </section>
  );
}
