"use client";

import { SignalBriefCard } from "@/components/fundgraph/SignalBriefCard";
import { SignalBriefItem } from "@/components/fundgraph/forYouTypes";

export function TodaysBrief({ items }: { items: SignalBriefItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Today&apos;s Brief</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Top signals to review</h2>
          <p className="mt-1 text-sm text-slate-600">Ranked for urgency and portfolio relevance.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <SignalBriefCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
