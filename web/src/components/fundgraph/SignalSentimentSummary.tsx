import { Signal } from "@/fundgraph/types";
import { dominantStance, signalStanceCounts, stanceBarPercent, stanceLabel } from "@/components/fundgraph/sentimentInsights";

export function SignalSentimentSummary({
  signal,
  compact = false,
}: {
  signal: Signal;
  compact?: boolean;
}) {
  const counts = signalStanceCounts(signal);
  const dominant = dominantStance(counts);
  const bullishPct = stanceBarPercent(counts.bullish, counts.total);
  const neutralPct = stanceBarPercent(counts.neutral, counts.total);
  const bearishPct = stanceBarPercent(counts.bearish, counts.total);

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Community Pulse</span>
          <span>Bullish {counts.bullish}</span>
          <span>Neutral {counts.neutral}</span>
          <span>Bearish {counts.bearish}</span>
          <span>Dominant: {stanceLabel(dominant)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="flex h-full w-full">
            <div className="h-full bg-emerald-500" style={{ width: `${bullishPct}%` }} />
            <div className="h-full bg-slate-400" style={{ width: `${neutralPct}%` }} />
            <div className="h-full bg-rose-500" style={{ width: `${bearishPct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">Community Pulse</p>
        <p className="font-semibold text-slate-700">Dominant: {stanceLabel(dominant)}</p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-emerald-100 px-2 py-1 text-center text-emerald-800">Bullish {counts.bullish}</div>
        <div className="rounded-lg bg-slate-200 px-2 py-1 text-center text-slate-700">Neutral {counts.neutral}</div>
        <div className="rounded-lg bg-rose-100 px-2 py-1 text-center text-rose-800">Bearish {counts.bearish}</div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="flex h-full w-full">
          <div className="h-full bg-emerald-500" style={{ width: `${bullishPct}%` }} />
          <div className="h-full bg-slate-400" style={{ width: `${neutralPct}%` }} />
          <div className="h-full bg-rose-500" style={{ width: `${bearishPct}%` }} />
        </div>
      </div>
    </section>
  );
}
