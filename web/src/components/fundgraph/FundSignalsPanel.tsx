"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { SignalSentimentSummary } from "@/components/fundgraph/SignalSentimentSummary";
import { confidenceLabel } from "@/components/fundgraph/fundProfileUtils";
import { curateSignalsForFeed } from "@/lib/fundgraph/quality";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";
import { Signal } from "@/fundgraph/types";

function confidenceTone(confidence: number): string {
  if (confidence >= 0.78) return "bg-emerald-100 text-emerald-700";
  if (confidence >= 0.62) return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-700";
}

export function FundSignalsPanel({
  signals,
  fundName,
}: {
  signals: Signal[];
  fundName: string;
}) {
  const [signalOverrides, setSignalOverrides] = useState<Record<string, Signal>>({});
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const currentSignals = useMemo(
    () =>
      curateSignalsForFeed(
        [...signals].map((signal) => signalOverrides[signal.id] ?? signal).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
        { maxPerFund: 0, surface: "fund" }
      ),
    [signalOverrides, signals]
  );
  const activeSignal = useMemo(
    () => currentSignals.find((signal) => signal.id === activeSignalId) ?? null,
    [activeSignalId, currentSignals]
  );
  const visibleSignals = useMemo(() => currentSignals, [currentSignals]);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Key Signals</h2>
            <p className="mt-1 text-sm text-slate-600">All fund signals with direct, clickable news citations.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {visibleSignals.length} signals
          </span>
        </div>

        {currentSignals.length ? (
          <ul className="mt-4 space-y-2">
            {visibleSignals.map((signal) => {
              const citationUrl = signal.evidenceUrl ?? signal.evidence?.url;
              return (
                <li
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
                      <p className="text-sm font-semibold text-slate-900">
                        <span className="mr-2 text-emerald-600">✓</span>
                        {signal.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{signal.summary}</p>
                      <div className="mt-2 text-xs text-slate-500">
                        {signal.authorName} · {relativeTimeFromIso(signal.createdAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${confidenceTone(signal.confidence)}`}>
                        {confidenceLabel(signal.confidence)} · {Math.round(signal.confidence * 100)}%
                      </span>
                      {signal.qualityTier === "WARNING" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                          Warning
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Verified: {signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0}</span>
                    {citationUrl ? (
                      <Link
                        href={citationUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-blue-700 hover:text-blue-800"
                      >
                        Citation
                      </Link>
                    ) : (
                      <span className="text-slate-400">No citation link</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <SignalSentimentSummary signal={signal} compact />
                  </div>
                  {signal.qualityTier === "WARNING" && signal.qualityReasons?.length ? (
                    <p className="mt-2 text-[11px] text-amber-700">Needs review: {signal.qualityReasons[0]}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] font-semibold text-slate-600">Click signal to open details</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No signals yet. Use Publish New Signal in the top bar to add intelligence.
          </div>
        )}
      </section>

      {activeSignal ? (
        <SignalReportDrawer
          open
          signal={activeSignal}
          fundName={fundName}
          closeLabel="Back to fund signals"
          onClose={() => setActiveSignalId(null)}
          onSignalUpdated={(updatedSignal) => {
            setSignalOverrides((prev) => ({ ...prev, [updatedSignal.id]: updatedSignal }));
          }}
        />
      ) : null}
    </>
  );
}
