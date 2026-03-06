"use client";

import { SignalReport } from "@/components/fundgraph/signalReportTypes";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function actionLabel(type: SignalReport["verification"]["activity_log"][number]["type"]): string {
  if (type === "verify") return "Verified";
  if (type === "challenge") return "Challenged";
  return "Stance";
}

export function SignalVerificationActivity({
  verification,
}: {
  verification: SignalReport["verification"];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Verification Activity</h3>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Verified: <span className="font-semibold text-slate-900">{verification.verified_count}</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Challenged: <span className="font-semibold text-slate-900">{verification.challenged_count}</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Bullish / Neutral / Bearish:{" "}
          <span className="font-semibold text-slate-900">
            {verification.bullish_count} / {verification.neutral_count} / {verification.bearish_count}
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Saves: <span className="font-semibold text-slate-900">{verification.saves}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {verification.activity_log.slice(0, 8).map((entry, index) => (
          <div key={`${entry.ts}-${entry.user_display}-${index + 1}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">{entry.user_display}</span> {actionLabel(entry.type)} ·{" "}
            <span className="text-slate-600">{formatDateTime(entry.ts)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
