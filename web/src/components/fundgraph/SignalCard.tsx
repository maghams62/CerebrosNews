"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { SignalPoll } from "@/components/fundgraph/SignalPoll";
import { dominantStance, signalStanceCounts } from "@/components/fundgraph/sentimentInsights";
import { useFundGraphState } from "@/fundgraph/state";
import { contribute, setSignalStance } from "@/lib/fundgraph/client";
import { Signal, SignalStanceType } from "@/fundgraph/types";
import { pct, relativeTimeFromIso } from "@/components/fundgraph/utils";

function verificationCount(signal: Signal): number {
  return signal.verifiedCount ?? signal.verifyCount ?? signal.verifies ?? 0;
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.78) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (confidence >= 0.62) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function nextStanceCounts(
  counts: { bullish: number; neutral: number; bearish: number },
  previousStance: SignalStanceType | null,
  nextStance: SignalStanceType
): { bullish: number; neutral: number; bearish: number } {
  const next = { ...counts };
  if (previousStance && previousStance !== nextStance) {
    next[previousStance] = Math.max(0, next[previousStance] - 1);
  }
  if (previousStance !== nextStance) {
    next[nextStance] += 1;
  }
  return next;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, textarea, select, summary, [role='button']"));
}

function SignalCardHeader({
  title,
  confidence,
  onOpenDetails,
}: {
  title: string;
  confidence: number;
  onOpenDetails: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <button
        type="button"
        onClick={onOpenDetails}
        className="line-clamp-2 w-full break-words text-left text-[1.1rem] font-semibold leading-snug text-slate-900 transition hover:text-slate-700"
      >
        {title}
      </button>
      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confidenceTone(confidence)}`}>
        {pct(confidence)}
      </span>
    </header>
  );
}

function SignalCardMeta({
  fundName,
  fundId,
  authorName,
  createdAt,
}: {
  fundName?: string;
  fundId: string;
  authorName: string;
  createdAt: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
      {fundName ? (
        <Link href={`/cerebrosfund/funds/${fundId}`} className="font-semibold text-slate-700 hover:text-slate-900">
          {fundName}
        </Link>
      ) : null}
      {fundName ? <span className="text-slate-300">•</span> : null}
      <span className="font-medium text-slate-600">{authorName}</span>
      <span className="text-slate-300">•</span>
      <span>{relativeTimeFromIso(createdAt)}</span>
    </div>
  );
}

function SignalCardSummary({
  summary,
  onOpenDetails,
}: {
  summary: string;
  onOpenDetails: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="line-clamp-3 w-full break-words text-left text-base leading-relaxed text-slate-600 transition hover:text-slate-700"
    >
      {summary}
    </button>
  );
}

function SignalCardFooter({
  onOpenDetails,
  onShare,
  onVerifiedClick,
  sharing,
  verifiedCount,
}: {
  onOpenDetails: () => void;
  onShare: () => void;
  onVerifiedClick: () => void;
  sharing: boolean;
  verifiedCount: number;
}) {
  return (
    <footer className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpenDetails}
        className="inline-flex h-9 items-center rounded-full bg-slate-900 px-3.5 text-xs font-semibold text-white transition hover:bg-slate-800"
      >
        Open details
      </button>
      <button
        type="button"
        onClick={onShare}
        disabled={sharing}
        className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {sharing ? "Sharing..." : "Share"}
      </button>
      <button
        type="button"
        onClick={onVerifiedClick}
        className="inline-flex h-9 items-center rounded-full px-1 text-xs font-medium text-slate-500 transition hover:text-slate-700"
      >
        Verified by {verifiedCount}
      </button>
    </footer>
  );
}

export function SignalCard({
  signal,
  fundName,
  initiallyOpen = false,
  initiallyOpenAddCitation = false,
  onOpenHandled,
}: {
  signal: Signal;
  fundName?: string;
  initiallyOpen?: boolean;
  initiallyOpenAddCitation?: boolean;
  onOpenHandled?: (signalId: string) => void;
}) {
  const { userId, userName, applyContributor } = useFundGraphState();
  const [currentSignal, setCurrentSignal] = useState(signal);
  const [activeStance, setActiveStance] = useState<SignalStanceType | null>(signal.userStance ?? null);
  const [stanceSubmitting, setStanceSubmitting] = useState<SignalStanceType | null>(null);
  const [sharing, setSharing] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const autoOpenedSignalId = useRef<string | null>(null);

  useEffect(() => {
    setCurrentSignal(signal);
    setActiveStance(signal.userStance ?? null);
  }, [signal]);

  useEffect(() => {
    if (!initiallyOpen) return;
    if (autoOpenedSignalId.current === currentSignal.id) return;
    autoOpenedSignalId.current = currentSignal.id;
    setReportOpen(true);
    if (typeof window !== "undefined") {
      const node = document.getElementById(`signal-${currentSignal.id}`);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onOpenHandled?.(currentSignal.id);
  }, [currentSignal.id, initiallyOpen, onOpenHandled]);

  async function submitStance(stance: SignalStanceType) {
    if (stanceSubmitting || stance === activeStance) return;
    const previousSignal = currentSignal;
    const previousStance = activeStance;
    const previousCounts = signalStanceCounts(currentSignal);
    const optimisticCounts = nextStanceCounts(previousCounts, previousStance, stance);
    setStanceSubmitting(stance);
    setVoteError(null);
    setActiveStance(stance);
    setCurrentSignal((prev) => ({
      ...prev,
      bullishCount: optimisticCounts.bullish,
      neutralCount: optimisticCounts.neutral,
      bearishCount: optimisticCounts.bearish,
      userStance: stance,
    }));
    try {
      const response = await setSignalStance(currentSignal.id, {
        userId,
        userName,
        stance,
      });
      const updatedSignal = {
        ...response.signal,
        bullishCount: response.stanceCounts.bullish,
        neutralCount: response.stanceCounts.neutral,
        bearishCount: response.stanceCounts.bearish,
        userStance: response.stance,
      };
      setCurrentSignal(updatedSignal);
      setActiveStance(response.stance);
      if (response.gamification) {
        applyContributor({ userId: response.gamification.userId, gamification: response.gamification });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to set stance.";
      setVoteError(message);
      setCurrentSignal(previousSignal);
      setActiveStance(previousStance);
    } finally {
      setStanceSubmitting(null);
    }
  }

  async function shareSignal() {
    if (sharing) return;
    setSharing(true);
    setShareMessage(null);
    setVoteError(null);
    const shareUrl =
      typeof window === "undefined"
        ? `/cerebrosfund/signals?signalId=${encodeURIComponent(currentSignal.id)}#signal-${encodeURIComponent(currentSignal.id)}`
        : `${window.location.origin}/cerebrosfund/signals?signalId=${encodeURIComponent(currentSignal.id)}#signal-${encodeURIComponent(currentSignal.id)}`;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      const snapshot = await contribute("share_signal", currentSignal.id, userId);
      applyContributor({ userId: snapshot.userId, gamification: snapshot });
      setShareMessage("Signal link copied.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to share signal.";
      setVoteError(message);
    } finally {
      setSharing(false);
    }
  }

  const counts = signalStanceCounts(currentSignal);
  const dominant = dominantStance(counts);
  const verified = verificationCount(currentSignal);

  return (
    <>
      <article
        id={`signal-${currentSignal.id}`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          setReportOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if (isInteractiveTarget(event.target)) return;
          event.preventDefault();
          setReportOpen(true);
        }}
        className="flex h-full cursor-pointer flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md"
      >
        <SignalCardHeader
          title={currentSignal.title}
          confidence={currentSignal.confidence}
          onOpenDetails={() => setReportOpen(true)}
        />
        <div className="mt-2">
          <SignalCardMeta
            fundName={fundName}
            fundId={currentSignal.fundId}
            authorName={currentSignal.authorName}
            createdAt={currentSignal.createdAt}
          />
        </div>
        <div className="mt-3">
          <SignalCardSummary summary={currentSignal.summary} onOpenDetails={() => setReportOpen(true)} />
        </div>

        <div className="mt-4">
          <SignalPoll
            current_user_vote={activeStance}
            bullish_count={counts.bullish}
            neutral_count={counts.neutral}
            bearish_count={counts.bearish}
            total_votes={counts.total}
            dominant_stance={dominant}
            disabled={Boolean(stanceSubmitting)}
            on_vote={submitStance}
          />
        </div>

        <div className="mt-4">
          <SignalCardFooter
            onOpenDetails={() => setReportOpen(true)}
            onShare={shareSignal}
            onVerifiedClick={() => setReportOpen(true)}
            sharing={sharing}
            verifiedCount={verified}
          />
        </div>
        {voteError ? <p className="mt-2 text-xs text-rose-700">{voteError}</p> : null}
        {shareMessage ? <p className="mt-2 text-xs text-slate-600">{shareMessage}</p> : null}
      </article>

      <SignalReportDrawer
        open={reportOpen}
        signal={currentSignal}
        fundName={fundName}
        openAddCitationOnOpen={initiallyOpenAddCitation}
        closeLabel="Back to signals"
        onClose={() => setReportOpen(false)}
        onSignalUpdated={(updatedSignal) => {
          setCurrentSignal(updatedSignal);
          setActiveStance((prev) => updatedSignal.userStance ?? prev);
        }}
      />
    </>
  );
}
