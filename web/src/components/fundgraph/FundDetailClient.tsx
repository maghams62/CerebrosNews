"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FundDiscussionPanel } from "@/components/fundgraph/FundDiscussionPanel";
import { FundGPCard } from "@/components/fundgraph/FundGPCard";
import { FundGraphPreview } from "@/components/fundgraph/FundGraphPreview";
import { FundAISummaryCard } from "@/components/fundgraph/FundAISummaryCard";
import { FundPortfolioGrid } from "@/components/fundgraph/FundPortfolioGrid";
import { FundSentimentSummary } from "@/components/fundgraph/FundSentimentSummary";
import { FundSignalActivitySummary } from "@/components/fundgraph/FundSignalActivitySummary";
import { FundSignalsPanel } from "@/components/fundgraph/FundSignalsPanel";
import { FundTrendDrivers } from "@/components/fundgraph/FundTrendDrivers";
import { DEFAULT_MEMO_CONFIG, GenerateMemoModal, MemoConfig } from "@/components/fundgraph/GenerateMemoModal";
import { UnlockBanner } from "@/components/fundgraph/UnlockBanner";
import {
  checkSizeLabel,
  FundDiscussionItem,
  fundDiscussionItems,
  fundMetrics,
  fundTypeLabel,
  geoFocusLabel,
  graphPreviewData,
  sectorFocusLabel,
  stageFocusLabel,
} from "@/components/fundgraph/fundProfileUtils";
import { useFundGraphState } from "@/fundgraph/state";
import { generateMemo, getFundDiscussion, listSignals } from "@/lib/fundgraph/client";
import { Fund, Signal } from "@/fundgraph/types";

export function FundDetailClient({
  fund,
  seedSignals,
}: {
  fund: Fund;
  seedSignals: Signal[];
}) {
  const formatAum = (aumM: number): string => {
    if (!Number.isFinite(aumM) || aumM <= 0) return "AUM N/A";
    return `$${aumM.toLocaleString()}M AUM`;
  };
  const router = useRouter();
  const { userId, tier, cred, applyContributor, isFundShortlisted, toggleFundShortlist } = useFundGraphState();
  const [signals, setSignals] = useState<Signal[]>(() =>
    [...seedSignals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  );
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [discussionItems, setDiscussionItems] = useState<FundDiscussionItem[]>(() => fundDiscussionItems(fund, seedSignals));
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;
  const metrics = fundMetrics(fund);
  const fundType = fundTypeLabel(fund);
  const stageFocus = stageFocusLabel(fund);
  const geoFocus = geoFocusLabel(fund);
  const sectorFocus = sectorFocusLabel(fund);
  const checkSize = checkSizeLabel(fund);
  const discussions = discussionItems.length ? discussionItems : fundDiscussionItems(fund, signals);
  const graphData = graphPreviewData(fund);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const baseline = [...seedSignals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setSignals(baseline);
    setSignalsLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("fundId", fund.id);
        params.set("limit", "200");
        const response = await listSignals(params);
        if (cancelled) return;
        const next = [...response.signals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setSignals(next);
      } catch {
        // Fall back to seed signals on fetch failure.
      } finally {
        if (!cancelled) setSignalsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fund.id, seedSignals]);

  useEffect(() => {
    let cancelled = false;
    const fallback = fundDiscussionItems(fund, signals);
    if (fallback.length) setDiscussionItems((current) => (current.length ? current : fallback));

    (async () => {
      try {
        const response = await getFundDiscussion(fund.id, 24);
        if (cancelled) return;
        if (response.items.length) {
          setDiscussionItems(
            response.items.map((item) => ({
              id: item.id,
              user: item.user,
              comment: item.comment,
              timestamp: item.timestamp,
              votes: item.votes,
              seeded: item.seeded,
              signalId: item.signalId,
            }))
          );
        }
      } catch {
        if (cancelled) return;
        setDiscussionItems((current) => (current.length ? current : fallback));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fund.id, signals]);

  async function generateFundMemo(config: MemoConfig) {
    if (memoLocked) {
      setMemoError("Generate memo requires Analyst tier or 2 credits.");
      setToast({ tone: "error", message: "Memo is locked for your current tier/credits." });
      return;
    }
    if (!fund.id) {
      setMemoError("Missing fund id.");
      setToast({ tone: "error", message: "Memo generation failed: missing fund id." });
      return;
    }
    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate memo for 2 credits?");
      if (!confirmed) return;
    }

    setMemoLoading(true);
    setMemoError(null);
    try {
      const memoResponse = await generateMemo({
        userId,
        fundId: fund.id,
        memoType: config.memoType,
        includeSignals: config.includeSignals,
        includePortfolio: config.includePortfolio,
        includeGraphContext: config.includeGraphContext,
        includeCommunityDiscussion: config.includeCommunityDiscussion,
        timeWindow: config.timeWindow,
      });
      if (memoResponse.gamification) {
        applyContributor({ userId: memoResponse.gamification.userId, gamification: memoResponse.gamification });
      }
      setMemoModalOpen(false);
      setToast({ tone: "success", message: "Memo ready. Opening memo page..." });
      router.push(`/cerebrosfund/memos/${memoResponse.memoId}`);
    } catch (error) {
      console.error("fund_memo_generation_failed", error);
      const message = error instanceof Error ? error.message : "memo_generation_failed";
      const displayMessage =
        message === "request_timeout"
          ? "Memo generation timed out. Try again in a moment."
          : message;
      setMemoError(displayMessage);
      setToast({ tone: "error", message: `Memo generation failed: ${displayMessage}` });
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`fixed top-5 right-5 z-50 rounded-xl px-3 py-2 text-xs font-semibold shadow ${
            toast.tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Fund Profile</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{fund.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{fundType}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatAum(fund.aumM)} | Vintage {fund.vintageYear}
            </p>
          </div>
          <div className="grid min-w-[220px] gap-2 text-sm">
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white">
              <div className="text-[11px] uppercase tracking-[0.08em] text-slate-300">Trend score</div>
              <div className="text-lg font-semibold">{fund.trendScore}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right text-emerald-800">
              <div className="text-[11px] uppercase tracking-[0.08em] text-emerald-600">Community score</div>
              <div className="text-lg font-semibold">{fund.communityScore}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Stage Focus: <span className="font-semibold text-slate-900">{stageFocus}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Check Size: <span className="font-semibold text-slate-900">{checkSize}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Geo: <span className="font-semibold text-slate-900">{geoFocus}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Focus: <span className="font-semibold text-slate-900">{sectorFocus}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMemoModalOpen(true)}
            disabled={memoLoading || memoLocked}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {memoLoading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            {memoLoading
              ? "Generating memo..."
              : tier === "analyst" || tier === "insider"
                ? "Generate Memo"
                : "Generate Memo (-2 credits)"}
          </button>
          <button
            type="button"
            onClick={() => toggleFundShortlist(fund.id)}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-xs font-semibold ${
              isFundShortlisted(fund.id)
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {isFundShortlisted(fund.id) ? "Saved to Shortlist" : "Save to Shortlist"}
          </button>
          <Link
            href={`/cerebrosfund/graph?fundId=${encodeURIComponent(fund.id)}`}
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Full Graph
          </Link>
          <Link
            href="/cerebrosfund/funds"
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Funds
          </Link>
        </div>
      </section>

      {memoLocked ? (
        <UnlockBanner title="Memo is locked for your tier." detail="Reach Analyst tier or earn 2 credits to generate memo." />
      ) : null}
      {memoError ? <p className="text-sm text-rose-700">{memoError}</p> : null}

      <GenerateMemoModal
        open={memoModalOpen}
        subjectLabel={fund.name}
        loading={memoLoading}
        initialConfig={DEFAULT_MEMO_CONFIG}
        onClose={() => setMemoModalOpen(false)}
        onGenerate={generateFundMemo}
      />

      <FundGPCard gp={fund.gp} />
      <FundAISummaryCard fund={fund} signals={signals} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h2 className="text-sm font-semibold text-slate-900">Strategy</h2>
        <p className="mt-2 text-sm text-slate-600">{fund.strategy}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Portfolio Size: <span className="font-semibold text-slate-900">{metrics.portfolioSize}</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Lead Investment Rate: <span className="font-semibold text-slate-900">{metrics.leadInvestmentRate}%</span>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Follow-on Rate: <span className="font-semibold text-slate-900">{metrics.followOnRate}%</span>
          </div>
        </div>
      </section>

      <FundPortfolioGrid companies={fund.portfolio} metrics={metrics} />

      {signalsLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
          Loading latest fund signals...
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <FundTrendDrivers fund={fund} signals={signals} />
        <FundSignalActivitySummary signals={signals} />
        <FundSentimentSummary signals={signals} />
      </div>

      <FundSignalsPanel signals={signals} fundName={fund.name} />

      <FundDiscussionPanel initialItems={discussions} />

      <FundGraphPreview
        fundId={fund.id}
        fundName={fund.name}
        companies={graphData.companies}
        coInvestors={graphData.coInvestors}
        founders={graphData.founders}
      />

      {!signals.length && !signalsLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
          No signals yet. Use Publish New Signal from the top bar to add one.
        </div>
      ) : null}
    </div>
  );
}
