"use client";

import Link from "next/link";
import { TodaysSignalItem } from "@/components/fundgraph/forYouTypes";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";

function confidenceTone(confidence: TodaysSignalItem["confidence"]): string {
  if (confidence === "High") return "bg-emerald-100 text-emerald-700";
  if (confidence === "Medium") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export function TodaysSignalsPanel({ items, referenceNowMs }: { items: TodaysSignalItem[]; referenceNowMs?: number }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Today&apos;s Brief</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Top signals to review</h2>
        </div>
        <Link
          href="/cerebrosfund/signals"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      <div className="mt-3 divide-y divide-slate-200">
        {items.length ? (
          items.map((item, idx) => (
            <article key={item.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={item.href} className="line-clamp-2 text-lg font-semibold text-slate-900 hover:text-slate-700">
                    {idx + 1}. {item.title}
                  </Link>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-600">{item.rationale}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{item.sourceCount} sources</span>
                    <span>{item.sourceLabel}</span>
                    <span>{item.fundName}</span>
                    <span>{relativeTimeFromIso(item.createdAt, referenceNowMs)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${confidenceTone(item.confidence)}`}>
                    {item.confidence}
                  </span>
                  <Link
                    href={item.href}
                    className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
            No recent signals in this window.
          </div>
        )}
      </div>
    </section>
  );
}
