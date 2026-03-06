"use client";

import Link from "next/link";
import { GraphQuerySnapshotItem } from "@/components/fundgraph/forYouTypes";

export function GraphQuerySnapshotsPanel({ items }: { items: GraphQuerySnapshotItem[] }) {
  const workspaceHref = items[0]?.href || "/cerebrosfund/graph";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Graph Query Snapshot</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Cross-tab opportunities to open</h2>
          <p className="mt-1 text-sm text-slate-600">Click any snapshot to open a concrete graph query generated from this cockpit.</p>
        </div>
        <Link
          href={workspaceHref}
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open full graph workspace
        </Link>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <Link key={item.id} href={item.href} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">{item.sourceLabel}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</p>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.subtitle}</p>
              <p className="mt-2 line-clamp-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                {item.query}
              </p>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500 lg:col-span-2">
            Snapshot queries will appear once enough activity is detected.
          </div>
        )}
      </div>
    </section>
  );
}
