import { Signal } from "@/fundgraph/types";
import { buildFundSentimentSummary, stanceBarPercent, stanceLabel } from "@/components/fundgraph/sentimentInsights";

export function FundSentimentSummary({
  signals,
  windowDays = 30,
}: {
  signals: Signal[];
  windowDays?: number;
}) {
  const summary = buildFundSentimentSummary(signals, windowDays);
  const bullishPct = stanceBarPercent(summary.counts.bullish, summary.counts.total);
  const neutralPct = stanceBarPercent(summary.counts.neutral, summary.counts.total);
  const bearishPct = stanceBarPercent(summary.counts.bearish, summary.counts.total);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Community Pulse</h2>
        <p className="text-xs font-semibold text-slate-600">{windowDays}d window</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Bullish: {summary.counts.bullish}</div>
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">Neutral: {summary.counts.neutral}</div>
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">Bearish: {summary.counts.bearish}</div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="flex h-full w-full">
          <div className="h-full bg-emerald-500" style={{ width: `${bullishPct}%` }} />
          <div className="h-full bg-slate-400" style={{ width: `${neutralPct}%` }} />
          <div className="h-full bg-rose-500" style={{ width: `${bearishPct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">Dominant stance: {stanceLabel(summary.dominant)}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{summary.shiftLabel}</span>
      </div>
    </section>
  );
}
