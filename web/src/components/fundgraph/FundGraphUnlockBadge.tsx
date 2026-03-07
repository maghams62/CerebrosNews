"use client";

import Link from "next/link";

export function FundGraphUnlockBadge() {
  return (
    <Link
      href="/cerebrosfund/credits"
      aria-label="Open how to earn credits"
      className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 transition hover:bg-slate-50"
    >
      Credits
    </Link>
  );
}
