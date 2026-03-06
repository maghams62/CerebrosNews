"use client";

import { TierLimits } from "@/lib/fundgraph/gamification.shared";

export function TierCreditSummary({
  tierLabel,
  tokenBalance,
  limits,
  dailyCapLabel,
}: {
  tierLabel: string;
  tokenBalance: number;
  limits: TierLimits;
  dailyCapLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Tier & Credit Summary</h2>
      <p className="mt-1 text-sm text-slate-600">Current status, daily caps, and active research perks for your tier.</p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Current Tier</span>
          <span className="font-semibold text-slate-900">{tierLabel}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Credit Balance</span>
          <span className="font-semibold text-slate-900">{tokenBalance}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Daily Cap</span>
          <span className="font-semibold text-slate-900">{dailyCapLabel}</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Active Perks</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">Claims visible: {limits.maxClaimsVisible >= 9999 ? "Full" : limits.maxClaimsVisible}</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">Signals visible: {limits.maxSignalsVisible >= 9999 ? "Full" : limits.maxSignalsVisible}</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">Graph depth: {limits.graphDepth}</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">Memo access: {limits.memoAllowed ? "Enabled" : "Locked"}</div>
        </div>
      </div>
    </section>
  );
}
