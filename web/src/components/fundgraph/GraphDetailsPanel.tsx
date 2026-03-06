"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { useFundGraphState } from "@/fundgraph/state";
import { Signal } from "@/fundgraph/types";
import { verifyClaim } from "@/lib/fundgraph/client";
import { CREDIT_DELTAS } from "@/lib/fundgraph/gamification.shared";
import { GraphNode } from "@/lib/fundgraph/graphTypes";

function asRecord(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  return meta as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatAum(aumM?: number): string {
  if (!Number.isFinite(aumM) || (aumM as number) <= 0) return "N/A";
  return `$${(aumM as number).toLocaleString()}M`;
}

function typeLabel(type: GraphNode["type"]): string {
  if (type === "fund") return "Fund";
  if (type === "company") return "Company";
  if (type === "claim") return "Claim";
  if (type === "signal") return "Signal";
  if (type === "source") return "Source";
  return "Person";
}

function buildSignalFromGraphNode(node: GraphNode, fallbackFundId?: string): Signal | null {
  if (node.type !== "signal") return null;
  const meta = asRecord(node.meta);
  const signalId = asString(meta.signalId);
  if (!signalId) return null;
  const verifiedCount = asNumber(meta.verifiedCount) ?? 0;
  const disputedCount = asNumber(meta.disputedCount) ?? 0;
  const confidence = asNumber(meta.confidence) ?? 0.6;
  const bullishCount = asNumber(meta.bullishCount) ?? asNumber(meta.upvotes) ?? 0;
  const neutralCount = asNumber(meta.neutralCount) ?? 0;
  const bearishCount = asNumber(meta.bearishCount) ?? 0;

  return {
    id: signalId,
    fundId: asString(meta.fundId) ?? fallbackFundId ?? "fund-unknown",
    title: node.label,
    summary: asString(meta.summary) ?? node.label,
    confidence,
    createdAt: asString(meta.createdAt) ?? new Date().toISOString(),
    authorName: "Community",
    upvotes: bullishCount,
    bullishCount,
    neutralCount,
    bearishCount,
    verifiedCount,
    verifyCount: verifiedCount,
    verifies: verifiedCount,
    disputedCount,
    disagreeCount: disputedCount,
    disagrees: disputedCount,
    commentsCount: 0,
    evidenceUrl: asString(meta.evidenceUrl),
    evidenceSnippet: asString(meta.evidenceSnippet),
    evidence: {
      url: asString(meta.evidenceUrl),
      snippet: asString(meta.evidenceSnippet),
    },
  };
}

export function GraphDetailsPanel({
  node,
  relatedNodes,
  onRefresh,
}: {
  node: GraphNode | null;
  relatedNodes: GraphNode[];
  onRefresh: () => Promise<void>;
}) {
  const { userId, userName, applyContributor } = useFundGraphState();
  const [voteSubmitting, setVoteSubmitting] = useState<"verify" | "dispute" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [signalReportOpen, setSignalReportOpen] = useState(false);
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null);

  const relatedClaims = useMemo(() => relatedNodes.filter((entry) => entry.type === "claim"), [relatedNodes]);
  const relatedSignals = useMemo(() => relatedNodes.filter((entry) => entry.type === "signal"), [relatedNodes]);
  const relatedFunds = useMemo(() => relatedNodes.filter((entry) => entry.type === "fund"), [relatedNodes]);
  const relatedFundName = relatedFunds[0]?.label;
  const relatedFundId = useMemo(() => asString(asRecord(relatedFunds[0]?.meta).fundId), [relatedFunds]);

  useEffect(() => {
    if (!node || node.type !== "signal") {
      setActiveSignal(null);
      setSignalReportOpen(false);
      return;
    }
    setActiveSignal(buildSignalFromGraphNode(node, relatedFundId));
  }, [node, relatedFundId]);

  if (!node) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Details</h3>
        <p className="mt-2 text-sm text-slate-600">Click a node to inspect citations, trust, and related entities.</p>
      </aside>
    );
  }

  const meta = asRecord(node.meta);
  const claimId = asString(meta.claimId);
  const sourceUrl = asString(meta.url) ?? asString(meta.citationUrl);
  const sourceTitle = asString(meta.title) ?? asString(meta.citationTitle);
  const sourceSnippet = asString(meta.snippet);
  const fundId = asString(meta.fundId) ?? asString(meta.relatedFundId);
  const fundSlug = asString(meta.slug) ?? asString(meta.relatedFundSlug);
  const articleId = asString(meta.articleId);
  const verifiedCount = asNumber(meta.verifiedCount) ?? 0;
  const disputedCount = asNumber(meta.disputedCount) ?? 0;

  async function submitClaimVote(vote: "verify" | "dispute") {
    if (!claimId) return;
    setActionError(null);
    setVoteSubmitting(vote);
    try {
      const response = await verifyClaim(claimId, {
        userId,
        userName,
        vote,
      });
      applyContributor({ ...response.contributor, gamification: response.gamification });
      await onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to submit vote.");
    } finally {
      setVoteSubmitting(null);
    }
  }

  return (
    <>
      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Details</h3>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Node</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{node.label}</p>
          <p className="text-xs text-slate-600">{typeLabel(node.type)}</p>
        </div>

        {node.type === "claim" ? (
          <div className="mt-3 space-y-3">
            {sourceSnippet ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">“{sourceSnippet}”</p> : null}
            {sourceTitle ? <p className="text-xs font-semibold text-slate-700">{sourceTitle}</p> : null}
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900">
                Open citation ↗
              </a>
            ) : null}
            <p className="text-xs text-slate-600">Community: {verifiedCount} verify / {disputedCount} dispute</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => submitClaimVote("verify")}
                disabled={Boolean(voteSubmitting)}
                className="h-9 rounded-full bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {voteSubmitting === "verify" ? "Verifying..." : `Verify (+${CREDIT_DELTAS.verify_claim} tokens)`}
              </button>
              <button
                type="button"
                onClick={() => submitClaimVote("dispute")}
                disabled={Boolean(voteSubmitting)}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {voteSubmitting === "dispute" ? "Submitting..." : `Dispute (+${CREDIT_DELTAS.verify_claim} tokens)`}
              </button>
            </div>
          </div>
        ) : null}

        {node.type === "signal" && activeSignal ? (
          <div className="mt-3 space-y-3 text-xs text-slate-700">
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{activeSignal.summary}</p>
            <p>
              Confidence: <span className="font-semibold text-slate-900">{Math.round((activeSignal.confidence ?? 0) * 100)}%</span>
            </p>
            <p>
              Community: <span className="font-semibold text-slate-900">{verifiedCount} verify / {disputedCount} dispute</span>
            </p>
            <button
              type="button"
              onClick={() => setSignalReportOpen(true)}
              className="inline-flex h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"
            >
              Verify
            </button>
          </div>
        ) : null}

        {node.type === "fund" ? (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            <p>AUM: <span className="font-semibold text-slate-900">{formatAum(asNumber(meta.aumM))}</span></p>
            <p>Portfolio: <span className="font-semibold text-slate-900">{asNumber(meta.portfolioCount) ?? 0} companies</span></p>
            <Link href={`/cerebrosfund/funds/${fundSlug ?? fundId ?? ""}`} className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Open fund
            </Link>
          </div>
        ) : null}

        {node.type === "company" ? (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            <p>Connected claims: <span className="font-semibold text-slate-900">{relatedClaims.length}</span></p>
            <p>Connected signals: <span className="font-semibold text-slate-900">{relatedSignals.length}</span></p>
            {relatedFunds[0] ? (
              <Link
                href={`/cerebrosfund/funds/${asString(relatedFunds[0].meta && asRecord(relatedFunds[0].meta).slug) ?? asString(asRecord(relatedFunds[0].meta).fundId) ?? ""}`}
                className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open related fund
              </Link>
            ) : null}
          </div>
        ) : null}

        {node.type === "source" ? (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {sourceTitle ? <p className="font-semibold text-slate-900">{sourceTitle}</p> : null}
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Open article ↗
              </a>
            ) : null}
            {articleId ? (
              <Link href={`/article/${articleId}`} className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Open in app
              </Link>
            ) : null}
          </div>
        ) : null}

        {node.type === "person" ? (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {fundId ? (
              <Link href={`/cerebrosfund/funds/${fundSlug ?? fundId}`} className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Open related fund
              </Link>
            ) : null}
          </div>
        ) : null}

        {relatedNodes.length ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Connected</p>
            <ul className="mt-2 space-y-1">
              {relatedNodes.slice(0, 8).map((entry) => (
                <li key={entry.id} className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">{entry.label}</span> <span className="text-slate-500">({typeLabel(entry.type)})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {actionError ? <p className="mt-3 text-xs text-rose-700">{actionError}</p> : null}
      </aside>

      {activeSignal ? (
        <SignalReportDrawer
          open={signalReportOpen}
          signal={activeSignal}
          fundName={relatedFundName}
          onClose={() => setSignalReportOpen(false)}
          onSignalUpdated={(updatedSignal) => {
            setActiveSignal(updatedSignal);
            void onRefresh();
          }}
        />
      ) : null}
    </>
  );
}
