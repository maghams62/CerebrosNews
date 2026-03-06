"use client";

import Link from "next/link";
import { relativeTimeFromIso } from "@/components/fundgraph/profile/profileHelpers";
import { ProfileActivityResponse } from "@/lib/fundgraph/client";

type MemoItem = ProfileActivityResponse["recent"]["memos"][number];

export function MyMemosPanel({
  memos,
}: {
  memos: MemoItem[];
}) {
  return (
    <section id="my-memos" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">My Memos & Research Artifacts</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600">Recent memos, watchlist briefs, and generated research output.</p>

      <div className="mt-3 space-y-2">
        {memos.length ? (
          memos.map((memo) => (
            <Link key={memo.id} href={`/cerebrosfund/memos/${memo.id}`} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{memo.title}</p>
                <span className="text-[11px] font-semibold text-slate-500">{relativeTimeFromIso(memo.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {memo.primaryFundName ?? "Multi-fund"} · {memo.memoType} · {memo.artifactType === "watchlist_brief" ? "Watchlist brief" : "Fund memo"}
              </p>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
            No memos created yet.
          </div>
        )}
      </div>
    </section>
  );
}
