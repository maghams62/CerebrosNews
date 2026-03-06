"use client";

export function AccountSnapshotCard({
  tierLabel,
  tokenBalance,
  contributionCount,
  nextTierLabel,
  progressPercent,
  progressLabel,
  onOpenHowItWorks,
}: {
  tierLabel: string;
  tokenBalance: number;
  contributionCount: number;
  nextTierLabel: string;
  progressPercent: number;
  progressLabel: string;
  onOpenHowItWorks?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Account Snapshot</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {tierLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Tokens</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{tokenBalance}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Contributions</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{contributionCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Current Tier</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{tierLabel}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Next Tier</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{nextTierLabel}</p>
        </div>
      </div>

      <div className="mt-4 h-2.5 w-full rounded-full bg-slate-200">
        <div className="h-2.5 rounded-full bg-slate-900 transition-all" style={{ width: `${progressPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-600">{progressLabel}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenHowItWorks}
          className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          How it works
        </button>
        <a href="#tier-benefits" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          See tier benefits
        </a>
        <a href="#contribution-activity" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View credit history
        </a>
      </div>
    </section>
  );
}
