"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VerificationRecordPanel } from "@/components/fundgraph/VerificationRecordPanel";
import { VerificationSummary } from "@/components/fundgraph/VerificationSummary";
import { useFundGraphState } from "@/fundgraph/state";
import { NewsClaim } from "@/fundgraph/types";
import { addClaimSource, getClaimVerificationRecord, verifyClaim as verifyClaimRequest } from "@/lib/fundgraph/client";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";

export function ClaimCard({ claim }: { claim: NewsClaim }) {
  const { userId, userName, applyContributor, applyGamification } = useFundGraphState();
  const [currentClaim, setCurrentClaim] = useState<NewsClaim>(claim);
  const [record, setRecord] = useState(claim.verificationRecord ?? null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [actionBusy, setActionBusy] = useState<"verify" | "dispute" | "add_source" | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const linkedFunds = currentClaim.linkedFundIds?.length ?? 0;

  useEffect(() => {
    setCurrentClaim(claim);
    setRecord(claim.verificationRecord ?? null);
  }, [claim]);

  async function refreshRecord() {
    setLoadingRecord(true);
    try {
      const payload = await getClaimVerificationRecord(currentClaim.id);
      setRecord(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch verification record.";
      setRequestError(message);
    } finally {
      setLoadingRecord(false);
    }
  }

  async function submitVote(
    vote: "verify" | "dispute",
    votePayload?: {
      note?: string;
    }
  ) {
    setActionBusy(vote);
    setRequestError(null);
    try {
      const response = await verifyClaimRequest(currentClaim.id, {
        userId,
        userName,
        vote,
        note: votePayload?.note,
      });
      setCurrentClaim(response.claim);
      setRecord(response.verificationRecord ?? response.claim.verificationRecord ?? null);
      applyContributor({ ...response.contributor, gamification: response.gamification });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit vote.";
      setRequestError(message);
    } finally {
      setActionBusy(null);
    }
  }

  async function submitSource(payload: {
    sourceType:
      | "PUBLIC_ARTICLE"
      | "TWEET_THREAD"
      | "PODCAST"
      | "YOUTUBE_VIDEO"
      | "PASTED_TEXT"
      | "PRIVATE_INTEL"
      | "FOUNDER_NOTE"
      | "LP_NOTE"
      | "GP_NOTE"
      | "FUND_DECK"
      | "OTHER";
    visibility: "PUBLIC" | "PRIVATE" | "ANONYMOUS";
    title?: string;
    url?: string;
    snippet?: string;
    note?: string;
    confidence?: "LOW" | "MEDIUM" | "HIGH";
    contributor?: {
      label?: string;
      role?:
        | "ANONYMOUS_FOUNDER"
        | "ANONYMOUS_SERIES_B_INVESTOR"
        | "ANONYMOUS_GP"
        | "ANONYMOUS_LP"
        | "OPERATOR"
        | "ANALYST"
        | "MEMBER"
        | "OTHER";
      tier?: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "INTERNAL_ANALYST" | "VERIFIED_PARTNER";
      isAnonymous?: boolean;
    };
  }) {
    setActionBusy("add_source");
    setRequestError(null);
    try {
      const response = await addClaimSource(currentClaim.id, { ...payload, userId });
      setCurrentClaim(response.claim);
      setRecord(response.verificationRecord ?? response.claim.verificationRecord ?? null);
      if (response.gamification) applyGamification(response.gamification);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add source.";
      setRequestError(message);
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <>
      <article id={`claim-${currentClaim.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{currentClaim.category}</span>
          <div className="text-xs text-slate-500">{relativeTimeFromIso(currentClaim.createdAt)}</div>
        </div>

        <p className="mt-3 text-sm font-medium text-slate-900">{currentClaim.claimText}</p>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Citation</p>
          <p className="mt-1 text-sm text-slate-700">“{currentClaim.citation.snippet}”</p>
          <a
            href={currentClaim.citation.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            {currentClaim.citation.title} ↗
          </a>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {linkedFunds ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">Linked funds {linkedFunds}</span>
          ) : null}
        </div>

        <div className="mt-3">
          <VerificationSummary
            claim={currentClaim}
            onViewVerification={() => {
              setPanelOpen(true);
              refreshRecord();
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/cerebrosfund/graph?claimId=${encodeURIComponent(currentClaim.id)}`}
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View in Graph
          </Link>
        </div>

        {requestError ? <p className="mt-2 text-xs text-rose-700">{requestError}</p> : null}
      </article>

      <VerificationRecordPanel
        open={panelOpen}
        claim={currentClaim}
        record={record ?? currentClaim.verificationRecord}
        loading={loadingRecord}
        actionBusy={actionBusy}
        error={requestError}
        onClose={() => setPanelOpen(false)}
        onVerify={() => submitVote("verify")}
        onDispute={(payload) => submitVote("dispute", payload)}
        onAddSource={submitSource}
      />
    </>
  );
}
