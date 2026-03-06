"use client";

import Link from "next/link";
import { Fund, Signal } from "@/fundgraph/types";
import { buildFundAiSummary } from "@/lib/fundgraph/fundAiSummary";

export function FundAISummaryCard({
  fund,
  signals,
}: {
  fund: Fund;
  signals: Signal[];
}) {
  const summary = buildFundAiSummary(fund, signals);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">AI Synthesis</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {summary.signalCount} signals analyzed
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-700">{summary.summary}</p>

      <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
        {summary.insights.map((insight) => (
          <li key={insight}>- {insight}</li>
        ))}
      </ul>

      {summary.citations.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.citations.map((citation) => (
            <Link
              key={`${citation.title}-${citation.url}`}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
            >
              {citation.title.length > 44 ? `${citation.title.slice(0, 43)}...` : citation.title}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

