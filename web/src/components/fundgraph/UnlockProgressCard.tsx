"use client";

import Link from "next/link";
import { useFundGraphState } from "@/fundgraph/state";
import { getNextTierThreshold } from "@/lib/fundgraph/gamification.shared";

export function UnlockProgressCard() {
  const { tier, contributions, cred } = useFundGraphState();
  const nextThreshold = getNextTierThreshold(tier);
  const currentFloor = tier === "insider" ? 25 : tier === "analyst" ? 10 : tier === "contributor" ? 3 : 0;
  const denom = nextThreshold ? Math.max(1, nextThreshold - currentFloor) : 1;
  const progress = nextThreshold ? Math.min(100, Math.round(((contributions - currentFloor) / denom) * 100)) : 100;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Unlock Intelligence</h3>
      <p className="mt-1 text-xs text-slate-600">
        Tier: <span className="font-semibold capitalize">{tier}</span> · Credits: <span className="font-semibold">{cred}</span>
      </p>

      {nextThreshold ? (
        <>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-slate-900" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {contributions}/{nextThreshold} contributions to next tier
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">Top tier reached. Full intelligence unlocked.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/cerebrosfund/signals" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Publish new signal
        </Link>
        <Link href="/cerebrosfund/signals" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Open signals
        </Link>
        <Link href="/cerebrosfund/claims" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Add a source
        </Link>
      </div>
    </div>
  );
}
