"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_MEMO_CONFIG, GenerateMemoModal, MemoConfig } from "@/components/fundgraph/GenerateMemoModal";
import { useFundGraphState } from "@/fundgraph/state";
import { generateMemo, generateWatchlistBrief, getFundsByIds } from "@/lib/fundgraph/client";
import { getFundOverview } from "@/lib/fundgraph/fundOverview";
import { Fund } from "@/fundgraph/types";

const MAX_SHORTLIST_RENDERED = 120;

function formatAum(aumM: number): string {
  if (!Number.isFinite(aumM) || aumM <= 0) return "AUM N/A";
  return `$${aumM.toLocaleString()}M AUM`;
}

export function ShortlistPageClient() {
  const router = useRouter();
  const {
    userId,
    tier,
    cred,
    applyContributor,
    shortlistFundIds,
    clearShortlistFunds,
    removeFundFromShortlist,
  } = useFundGraphState();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFund, setActiveFund] = useState<Fund | null>(null);
  const [fundsById, setFundsById] = useState<Map<string, Fund>>(new Map());
  const [fundsLoading, setFundsLoading] = useState(false);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;
  const shortlistIds = useMemo(() => shortlistFundIds.slice(0, MAX_SHORTLIST_RENDERED), [shortlistFundIds]);
  const shortlistIdsKey = useMemo(() => shortlistIds.join(","), [shortlistIds]);

  useEffect(() => {
    let cancelled = false;

    if (!shortlistIds.length) {
      setFundsById(new Map());
      setFundsLoading(false);
      setFundsError(null);
      return () => {
        cancelled = true;
      };
    }

    setFundsLoading(true);
    setFundsError(null);
    (async () => {
      try {
        const response = await getFundsByIds(shortlistIds);
        if (cancelled) return;
        const next = new Map<string, Fund>();
        for (const fund of response.funds) {
          next.set(fund.id, fund);
          if (fund.slug) next.set(fund.slug, fund);
        }
        setFundsById(next);
      } catch (fetchError) {
        if (cancelled) return;
        const message = fetchError instanceof Error ? fetchError.message : "shortlist_fetch_failed";
        setFundsError(message);
      } finally {
        if (!cancelled) setFundsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shortlistIds, shortlistIdsKey]);

  const shortlistFunds = useMemo(() => {
    return shortlistIds.map((id) => fundsById.get(id)).filter((fund): fund is Fund => Boolean(fund));
  }, [fundsById, shortlistIds]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(shortlistFunds.map((fund) => fund.id));
      const next = current.filter((id) => valid.has(id));
      if (next.length) return next;
      return shortlistFunds.slice(0, 12).map((fund) => fund.id);
    });
  }, [shortlistFunds]);

  async function generateFundMemo(config: MemoConfig) {
    if (!activeFund) return;
    if (memoLocked) {
      setError("Generate memo requires Analyst tier or 2 credits.");
      return;
    }
    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate memo for 2 credits?");
      if (!confirmed) return;
    }

    setMemoLoading(true);
    setError(null);
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
      router.push(`/cerebrosfund/memos/${response.memoId}`);
    } catch (memoError) {
      const message = memoError instanceof Error ? memoError.message : "memo_generation_failed";
      setError(message === "request_timeout" ? "Memo generation timed out. Please try again." : message);
    } finally {
      setMemoLoading(false);
    }
  }

  async function generateBrief() {
    if (memoLocked) {
      setError("Generate watchlist brief requires Analyst tier or 2 credits.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Select at least 2 shortlisted funds to generate a watchlist brief.");
      return;
    }
    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate watchlist brief for 2 credits?");
      if (!confirmed) return;
    }

    setBriefLoading(true);
    setError(null);
    try {
      const response = await generateWatchlistBrief({
        userId,
        fundIds: selectedIds,
        memoType: "quick_brief",
        includeSignals: true,
        includePortfolio: true,
        includeGraphContext: true,
        includeCommunityDiscussion: true,
        timeWindow: "30d",
      });
      if (response.gamification) {
        applyContributor({ userId: response.gamification.userId, gamification: response.gamification });
      }
      router.push(`/cerebrosfund/memos/${response.memoId}`);
    } catch (briefError) {
      const message = briefError instanceof Error ? briefError.message : "memo_generation_failed";
      setError(message === "request_timeout" ? "Watchlist brief request timed out. Please try again." : message);
    } finally {
      setBriefLoading(false);
    }
  }

  function toggleSelection(fundId: string) {
    setSelectedIds((current) => (current.includes(fundId) ? current.filter((id) => id !== fundId) : [...current, fundId]));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Shortlist</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Research Queue</h1>
            <p className="mt-1 text-sm text-slate-600">
              Save funds here, then generate a memo on one fund or a watchlist brief on selected funds.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {shortlistIds.length} shortlisted funds · {selectedIds.length} selected for watchlist brief.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateBrief}
              disabled={briefLoading || memoLocked || selectedIds.length < 2}
              className="inline-flex h-9 items-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {briefLoading ? "Generating..." : "Generate Watchlist Brief"}
            </button>
            <button
              type="button"
              onClick={clearShortlistFunds}
              disabled={!shortlistIds.length}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Clear Shortlist
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {fundsError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Failed to load shortlist funds: {fundsError}
        </div>
      ) : null}

      {shortlistFunds.length ? (
        <section className="space-y-3">
          {shortlistFunds.map((fund) => (
            <article key={fund.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(fund.id)}
                    onChange={() => toggleSelection(fund.id)}
                    className="mt-1 h-4 w-4 rounded accent-slate-900"
                  />
                  <div className="min-w-0">
                    <Link href={`/cerebrosfund/funds/${fund.id}`} className="text-base font-semibold text-slate-900 hover:text-slate-700">
                      {fund.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {fund.headquarters} · {formatAum(fund.aumM)} · Trend {fund.trendScore}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{getFundOverview(fund).text}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveFund(fund)}
                    disabled={memoLocked || memoLoading}
                    className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {memoLoading && activeFund?.id === fund.id ? "Generating..." : "Generate Memo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFundFromShortlist(fund.id)}
                    className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : fundsLoading && shortlistIds.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          Loading shortlisted funds...
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
          No funds in your shortlist yet. Save funds from For You, Funds, or Fund pages.
        </div>
      )}

      <GenerateMemoModal
        open={Boolean(activeFund)}
        subjectLabel={activeFund?.name ?? "Selected fund"}
        loading={memoLoading}
        initialConfig={DEFAULT_MEMO_CONFIG}
        onClose={() => setActiveFund(null)}
        onGenerate={generateFundMemo}
      />
    </div>
  );
}
