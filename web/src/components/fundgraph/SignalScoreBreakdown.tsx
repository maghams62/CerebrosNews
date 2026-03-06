"use client";

import { SignalReport } from "@/components/fundgraph/signalReportTypes";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function SignalScoreBreakdown({ score }: { score: SignalReport["score"] }) {
  const totalContribution = Math.max(
    1,
    score.components.reduce((sum, component) => sum + Math.max(0, component.contribution), 0)
  );
  const totalPenalty = score.penalties.reduce((sum, penalty) => sum + penalty.amount, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Score Breakdown</h3>
      <p className="mt-1 text-xs text-slate-600">Score = Σ(weight_i * feature_i) - penalties</p>

      <div className="mt-3">
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          {score.components.map((component, index) => {
            const width = `${Math.max(4, (component.contribution / totalContribution) * 100)}%`;
            const colors = ["bg-emerald-500", "bg-sky-500", "bg-indigo-500", "bg-amber-500", "bg-cyan-500", "bg-teal-500", "bg-slate-500"];
            return (
              <div
                key={component.key}
                className={colors[index % colors.length]}
                style={{ width }}
                title={`${component.label}: ${component.contribution.toFixed(2)}`}
              />
            );
          })}
        </div>
        {totalPenalty > 0 ? (
          <div className="mt-2 text-xs font-semibold text-rose-700">
            Penalties applied: -{totalPenalty.toFixed(2)}
          </div>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
              <th className="px-2 py-2">Component</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Weight</th>
              <th className="px-2 py-2">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {score.components.map((component) => (
              <tr key={component.key} className="border-b border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-900">{component.label}</td>
                <td className="px-2 py-2">{component.value_0_1.toFixed(2)}</td>
                <td className="px-2 py-2">{pct(component.weight)}</td>
                <td className="px-2 py-2 font-semibold text-slate-900">{component.contribution.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">How calculated</summary>
        <p className="mt-2 text-xs text-slate-600">{score.formula_text}</p>
      </details>
    </section>
  );
}
