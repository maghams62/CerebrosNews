import { Fund, Signal } from "@/fundgraph/types";
import { deriveFundTrendDrivers } from "@/components/fundgraph/sentimentInsights";

export function FundTrendDrivers({
  fund,
  signals,
  windowDays = 30,
}: {
  fund: Fund;
  signals: Signal[];
  windowDays?: number;
}) {
  const drivers = deriveFundTrendDrivers(fund, signals, windowDays);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Trend Drivers</h2>
        <p className="text-xs font-semibold text-slate-600">{windowDays}d window</p>
      </div>

      <ul className="mt-3 space-y-2">
        {drivers.slice(0, 3).map((driver) => (
          <li key={`${fund.id}-${driver}`} className="line-clamp-1 text-sm text-slate-700">
            • {driver}
          </li>
        ))}
      </ul>
    </section>
  );
}
