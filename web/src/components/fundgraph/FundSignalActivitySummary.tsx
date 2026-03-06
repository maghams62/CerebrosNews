import { Signal } from "@/fundgraph/types";
import { buildFundSignalActivitySummary, stanceLabel } from "@/components/fundgraph/sentimentInsights";

export function FundSignalActivitySummary({
  signals,
  windowDays = 30,
}: {
  signals: Signal[];
  windowDays?: number;
}) {
  const summary = buildFundSignalActivitySummary(signals, windowDays);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Signal Activity</h2>

      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        <li>{summary.signalsLastWindow} signals in last {windowDays}d</li>
        <li>{summary.verifiedSignals} verified</li>
        <li>{summary.challengedSignals} challenged</li>
        <li>Dominant sentiment: {stanceLabel(summary.dominantSentiment)}</li>
        <li className="line-clamp-1">
          Latest movement: {summary.latestMovement ?? "No new movement"}
        </li>
      </ul>
    </section>
  );
}
