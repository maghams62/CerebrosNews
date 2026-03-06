"use client";

import Link from "next/link";

type QuickCard = {
  label: string;
  value: number;
  href: string;
};

export function QuickAccessPanel({
  items,
}: {
  items: QuickCard[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">My Research Workspace</h2>
      <p className="mt-1 text-sm text-slate-600">Saved signals, memos, shortlist, and contributions in one place.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-white"
          >
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
