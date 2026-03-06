"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { SignalSentimentSummary } from "@/components/fundgraph/SignalSentimentSummary";
import { confidenceLabel } from "@/components/fundgraph/fundProfileUtils";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";
import { Signal } from "@/fundgraph/types";

export function FundRecentSignals({
  signals,
  fundName,
}: {
  signals: Signal[];
  fundName: string;
}) {
  const [currentSignals, setCurrentSignals] = useState(
    [...signals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  );
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const activeSignal = useMemo(
    () => currentSignals.find((signal) => signal.id === activeSignalId) ?? null,
    [activeSignalId, currentSignals]
  );
  const visibleSignals = useMemo(() => currentSignals.slice(0, 8), [currentSignals]);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h2 className="text-sm font-semibold text-slate-900">Recent Signals</h2>
        <p className="mt-1 text-sm text-slate-600">Feed of the latest signals mentioning this fund.</p>
        <p className="mt-1 text-xs text-slate-500">{visibleSignals.length} signals</p>

        <div className="mt-4 space-y-2">
          {currentSignals.length ? (
            visibleSignals.map((signal) => (
              <article
                key={signal.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveSignalId(signal.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveSignalId(signal.id);
                  }
                }}
                className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{signal.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{signal.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{signal.authorName}</span>
                      <span>{relativeTimeFromIso(signal.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {confidenceLabel(signal.confidence)} · {Math.round(signal.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {signal.evidenceUrl ? (
                  <Link
                    href={signal.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Open source
                  </Link>
                ) : null}
                <div className="mt-2">
                  <SignalSentimentSummary signal={signal} compact />
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-600">Click signal to open details</p>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              No recent signals found for this fund.
            </div>
          )}
        </div>
      </section>

      {activeSignal ? (
        <SignalReportDrawer
          open
          signal={activeSignal}
          fundName={fundName}
          closeLabel="Back to fund signals"
          onClose={() => setActiveSignalId(null)}
          onSignalUpdated={(updatedSignal) => {
            setCurrentSignals((prev) => prev.map((signal) => (signal.id === updatedSignal.id ? updatedSignal : signal)));
          }}
        />
      ) : null}
    </>
  );
}
