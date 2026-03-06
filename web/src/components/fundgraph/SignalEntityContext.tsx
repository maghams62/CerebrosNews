"use client";

import { SignalReport } from "@/components/fundgraph/signalReportTypes";

export function SignalEntityContext({
  context,
  entities,
}: {
  context: SignalReport["context"];
  entities: SignalReport["entities"];
}) {
  const contextLine = context.stage
    ? `${context.stage} ${context.sector_tags[0] ?? "technology"} company with ${context.headcount_trend ?? "stable"} team trend.`
    : `Company context indicates ${context.sector_tags.join(", ") || "multi-sector"} exposure.`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Entity Context</h3>
      <p className="mt-1 text-xs text-slate-600">{contextLine}</p>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Stage: <span className="font-semibold text-slate-900">{context.stage ?? "Unknown"}</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Location: <span className="font-semibold text-slate-900">{context.location ?? "N/A"}</span>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Sector / Tags:
        <span className="ml-1 font-semibold text-slate-900">{context.sector_tags.join(", ") || "N/A"}</span>
      </div>

      {context.investors?.length ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Known investors: <span className="font-semibold text-slate-900">{context.investors.join(", ")}</span>
        </div>
      ) : null}

      {context.headcount_trend ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Headcount trend: <span className="font-semibold text-slate-900">{context.headcount_trend}</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {entities.companies.map((company) => (
          <span key={`company-${company}`} className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
            Company: {company}
          </span>
        ))}
        {entities.funds.map((fund) => (
          <span key={`fund-${fund}`} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Fund: {fund}
          </span>
        ))}
      </div>
    </section>
  );
}
