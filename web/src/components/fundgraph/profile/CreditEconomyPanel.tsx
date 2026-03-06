"use client";

import { DAILY_ACTION_CAPS, DAILY_CREDITS_CAP, EARN_RULES, SPEND_RULES, Tier } from "@/lib/fundgraph/gamification.shared";

export function CreditEconomyPanel({
  tier,
}: {
  tier: Tier;
}) {
  return (
    <section id="credit-economy" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Tier & Credit System</h2>
      <p className="mt-1 text-sm text-slate-600">Understand how contributions unlock deeper research and platform capabilities.</p>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Current Status</p>
          <p className="mt-2 text-sm text-slate-700">Tier: <span className="font-semibold capitalize text-slate-900">{tier}</span></p>
          <p className="mt-1 text-sm text-slate-700">Daily earning cap: <span className="font-semibold text-slate-900">{DAILY_CREDITS_CAP} tokens</span></p>
          <p className="mt-1 text-xs text-slate-600">This section explains economics, not game mechanics.</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">How to Earn</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
            {EARN_RULES.map((rule) => (
              <li key={rule.key} className="flex items-center justify-between gap-2">
                <span>{rule.label}</span>
                <span className="font-semibold text-emerald-700">+{rule.deltaCredits}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">How Credits Are Spent</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
            {SPEND_RULES.map((rule) => (
              <li key={rule.key} className="flex items-center justify-between gap-2">
                <span>{rule.label}</span>
                <span className="font-semibold text-slate-900">{rule.costText}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Daily Action Caps</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(DAILY_ACTION_CAPS).map(([key, value]) => (
            <span key={key} className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {key.replace(/_/g, " ")}: {value}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
