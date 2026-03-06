"use client";

import Link from "next/link";

export function UnlockBanner({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">{title}</p>
      {detail ? <p className="mt-1 text-xs text-amber-800">{detail}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/cerebrosfund/signals"
          className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Publish new signal
        </Link>
        <Link
          href="/cerebrosfund/funds"
          className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Explore funds
        </Link>
      </div>
    </div>
  );
}
