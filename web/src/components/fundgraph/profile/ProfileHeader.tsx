"use client";

import Link from "next/link";

export function ProfileHeader({
  userName,
  userId,
  tierLabel,
  tokenBalance,
  contributionCount,
  syncStatus,
  summaryLine,
}: {
  userName: string;
  userId: string;
  tierLabel: string;
  tokenBalance: number;
  contributionCount: number;
  syncStatus: string;
  summaryLine: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">My Profile</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{userName || "Demo User"}</h1>
          <p className="mt-1 text-sm text-slate-600">@{userId}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {tierLabel}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-700">{summaryLine}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Token Balance</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{tokenBalance}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Contributions</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{contributionCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Preference Sync</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{syncStatus}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/cerebrosfund/signals" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View Saved Signals
        </Link>
        <Link href="/cerebrosfund/shortlist" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View Shortlist
        </Link>
        <a href="#my-memos" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View Memos
        </a>
        <a href="#contribution-activity" className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View Contributions
        </a>
      </div>
    </section>
  );
}
