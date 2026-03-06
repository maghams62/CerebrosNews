"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FundAvatar } from "@/components/fundgraph/FundAvatar";
import { DEFAULT_MEMO_CONFIG, GenerateMemoModal, MemoConfig } from "@/components/fundgraph/GenerateMemoModal";
import { useFundGraphState } from "@/fundgraph/state";
import { generateMemo } from "@/lib/fundgraph/client";
import { getFundOverview } from "@/lib/fundgraph/fundOverview";
import { Fund } from "@/fundgraph/types";

function formatCheckRange(min: number, max: number): string {
  return `$${min.toFixed(1)}M-$${max.toFixed(0)}M`;
}

function formatAum(aumM: number): string {
  if (!Number.isFinite(aumM) || aumM <= 0) return "N/A";
  return `$${aumM.toLocaleString()}M`;
}

export function FundCard({ fund, compact = false }: { fund: Fund; compact?: boolean }) {
  const router = useRouter();
  const {
    userId,
    tier,
    cred,
    applyContributor,
    isFundShortlisted,
    toggleFundShortlist,
  } = useFundGraphState();
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const overview = getFundOverview(fund).text;

  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;

  async function generateFundMemo(config: MemoConfig) {
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
        fundId: fund.id,
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
      setMemoOpen(false);
      router.push(`/cerebrosfund/memos/${response.memoId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "memo_generation_failed";
      setMemoError(message === "request_timeout" ? "Memo generation timed out. Please try again." : message);
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <article className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <div className="absolute top-5 right-5 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
        Trend ↑{fund.trendScore}
      </div>

      <div className="flex items-start justify-between gap-3 pr-20">
        <div className="flex min-w-0 items-start gap-2.5">
          <FundAvatar name={fund.name} imageUrl={fund.gp.photoUrl} />
          <div className="min-w-0">
            <Link href={`/cerebrosfund/funds/${fund.id}`} className="text-base font-semibold text-slate-900 hover:text-slate-700">
              {fund.name}
            </Link>
            <p className="mt-1 text-xs text-slate-500">{fund.headquarters}</p>
          </div>
        </div>
      </div>

      <p className={`mt-3 text-sm text-slate-600 ${compact ? "line-clamp-2" : "line-clamp-2"}`}>{overview}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {fund.sectors.slice(0, 3).map((sector) => (
          <span key={sector} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {sector}
          </span>
        ))}
        {fund.stages.slice(0, 2).map((stage) => (
          <span key={stage} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            {stage}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">AUM</p>
          <p className="mt-1 text-xs font-semibold text-slate-900">{formatAum(fund.aumM)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Check</p>
          <p className="mt-1 text-xs font-semibold text-slate-900">{formatCheckRange(fund.checkSizeMinM, fund.checkSizeMaxM)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Vintage</p>
          <p className="mt-1 text-xs font-semibold text-slate-900">{fund.vintageYear}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/cerebrosfund/funds/${fund.id}`}
          className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Fund
        </Link>
        <button
          type="button"
          onClick={() => toggleFundShortlist(fund.id)}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold ${
            isFundShortlisted(fund.id)
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {isFundShortlisted(fund.id) ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setMemoOpen(true)}
          disabled={memoLocked || memoLoading}
          className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {memoLoading ? "Generating..." : memoLocked ? "Generate Memo (Locked)" : "Generate Memo"}
        </button>
      </div>

      {memoError ? <p className="mt-2 text-xs text-rose-700">{memoError}</p> : null}

      <GenerateMemoModal
        open={memoOpen}
        subjectLabel={fund.name}
        loading={memoLoading}
        initialConfig={DEFAULT_MEMO_CONFIG}
        onClose={() => setMemoOpen(false)}
        onGenerate={generateFundMemo}
      />
    </article>
  );
}
