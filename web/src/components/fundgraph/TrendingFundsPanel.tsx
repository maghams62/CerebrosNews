"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_MEMO_CONFIG, GenerateMemoModal, MemoConfig } from "@/components/fundgraph/GenerateMemoModal";
import { TrendingFundPanelItem } from "@/components/fundgraph/forYouTypes";
import { SectionHelpTooltip } from "@/components/fundgraph/SectionHelpTooltip";
import { useFundGraphState } from "@/fundgraph/state";
import { generateMemo } from "@/lib/fundgraph/client";

function deltaTone(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-500";
}

function formatAum(aumM: number): string {
  if (!Number.isFinite(aumM) || aumM <= 0) return "AUM N/A";
  return `$${new Intl.NumberFormat("en-US").format(aumM)}M AUM`;
}

export function TrendingFundsPanel({ items }: { items: TrendingFundPanelItem[] }) {
  const {
    userId,
    tier,
    cred,
    applyContributor,
    isFundShortlisted,
    toggleFundShortlist,
  } = useFundGraphState();
  const [activeFund, setActiveFund] = useState<{ id: string; name: string } | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;

  async function generateForActiveFund(config: MemoConfig) {
    if (!activeFund) return;

    if (memoLocked) {
      setMemoError("Generate memo requires Analyst tier or 2 credits.");
      return;
    }

    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate memo for 2 credits?");
      if (!confirmed) return;
    }

    setMemoLoading(true);
    setMemoError(null);
    try {
      const response = await generateMemo({
        userId,
        fundId: activeFund.id,
        memoType: config.memoType,
        includeSignals: config.includeSignals,
        includePortfolio: config.includePortfolio,
        includeGraphContext: config.includeGraphContext,
        includeCommunityDiscussion: config.includeCommunityDiscussion,
        timeWindow: config.timeWindow,
      });

      if (response.gamification) {
        applyContributor({ userId: response.gamification.userId, gamification: response.gamification });
      }

      setActiveFund(null);
      if (typeof window !== "undefined") {
        window.location.assign(`/cerebrosfund/memos/${response.memoId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "memo_generation_failed";
      setMemoError(message === "request_timeout" ? "Memo generation timed out. Please try again." : message);
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Trending Funds</div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Entities moving right now</h2>
            <SectionHelpTooltip text="Highlights funds with strong recent movement so you can track who is gaining momentum." />
          </div>
        </div>
        <Link
          href="/cerebrosfund/funds"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <article key={item.fundId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={item.href} className="line-clamp-1 text-lg font-semibold text-slate-900 hover:text-slate-700">
                    {item.fundName}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.stage} · {formatAum(item.aumM)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">Trend {item.trendScore}</p>
                  <p className={`text-sm font-semibold ${deltaTone(item.trendDelta)}`}>
                    {item.trendDelta >= 0 ? "↑ +" : "↓ "}
                    {item.trendDelta}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Trend Drivers</p>
                <ul className="mt-1 space-y-1.5">
                  {item.trendDrivers.slice(0, 3).map((driver) => (
                    <li key={`${item.fundId}-${driver}`} className="line-clamp-1 text-sm text-slate-700">
                      • {driver}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-2 line-clamp-1 text-xs text-slate-600">{item.graphQuery}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={item.graphHref}
                  className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open graph query
                </Link>
                <button
                  type="button"
                  onClick={() => toggleFundShortlist(item.fundId)}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold ${
                    isFundShortlisted(item.fundId)
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isFundShortlisted(item.fundId) ? "Saved" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFund({ id: item.fundId, name: item.fundName })}
                  disabled={memoLocked || memoLoading}
                  className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {memoLoading && activeFund?.id === item.fundId ? "Generating..." : memoLocked ? "Generate (Locked)" : "Generate Memo"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500 md:col-span-2">
            No trending funds in this window.
          </div>
        )}
      </div>

      {memoError ? <p className="mt-3 text-xs text-rose-700">{memoError}</p> : null}

      <GenerateMemoModal
        open={Boolean(activeFund)}
        subjectLabel={activeFund?.name ?? "Selected fund"}
        loading={memoLoading}
        initialConfig={DEFAULT_MEMO_CONFIG}
        onClose={() => setActiveFund(null)}
        onGenerate={generateForActiveFund}
      />
    </section>
  );
}
