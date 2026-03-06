"use client";

import Link from "next/link";
import { contributionLabel, relativeTimeFromIso } from "@/components/fundgraph/profile/profileHelpers";
import { ProfileActivityResponse } from "@/lib/fundgraph/client";

type ContributionEventItem = ProfileActivityResponse["recent"]["contributionEvents"][number];
type PublishedSignalItem = ProfileActivityResponse["recent"]["publishedSignals"][number];

export function MyContributionActivity({
  events,
  recentSignals,
}: {
  events: ContributionEventItem[];
  recentSignals: PublishedSignalItem[];
}) {
  return (
    <section id="contribution-activity" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">My Signals & Contribution Activity</h2>
      <p className="mt-1 text-sm text-slate-600">Recent publishing, verification, sourcing, and contribution actions.</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Recent contribution events</p>
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{contributionLabel(event.type)}</p>
                  <span className={`text-xs font-semibold ${event.deltaCredits >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {event.deltaCredits >= 0 ? `+${event.deltaCredits}` : event.deltaCredits}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{relativeTimeFromIso(event.createdAt)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No contribution activity yet.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Recently published signals</p>
          {recentSignals.length ? (
            recentSignals.map((signal) => (
              <Link
                key={signal.id}
                href={`/cerebrosfund/signals?signalId=${encodeURIComponent(signal.id)}#signal-${encodeURIComponent(signal.id)}`}
                className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-white"
              >
                <p className="line-clamp-1 text-sm font-semibold text-slate-900">{signal.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {signal.fundName} · {relativeTimeFromIso(signal.createdAt)} · {Math.round(signal.confidence * 100)}% confidence
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No published signals yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
