"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddSourceModal } from "@/components/fundgraph/AddSourceModal";
import { DisputeClaimModal } from "@/components/fundgraph/DisputeClaimModal";
import { SignalAISummary } from "@/components/fundgraph/SignalAISummary";
import { SignalChallengesPanel } from "@/components/fundgraph/SignalChallengesPanel";
import { SignalEntityContext } from "@/components/fundgraph/SignalEntityContext";
import { SignalEvidenceGraph } from "@/components/fundgraph/SignalEvidenceGraph";
import { SignalEvidenceList } from "@/components/fundgraph/SignalEvidenceList";
import { SignalPoll } from "@/components/fundgraph/SignalPoll";
import { SignalScoreBreakdown } from "@/components/fundgraph/SignalScoreBreakdown";
import { SignalVerificationActivity } from "@/components/fundgraph/SignalVerificationActivity";
import { useSignalUnlocks } from "@/components/fundgraph/useSignalUnlocks";
import {
  SignalReport,
  deriveSignalReportStatus,
  signalConfidenceLabel,
  signalReportStatusLabel,
} from "@/components/fundgraph/signalReportTypes";
import { buildSignalReport } from "@/components/fundgraph/buildSignalReport";
import { dominantStance, signalStanceCounts } from "@/components/fundgraph/sentimentInsights";
import { useFundGraphState } from "@/fundgraph/state";
import { fieldLikeBullets, normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";
import {
  AdvancedSignalInsight,
  EvidenceConfidenceTier,
  EvidenceSourceType,
  EvidenceVisibility,
  Signal,
  SignalStanceType,
  Source,
} from "@/fundgraph/types";
import {
  addSignalSource,
  getSignalSources,
  getSignalAdvancedInsight,
  refreshSignalAdvancedInsight,
  setSignalStance,
  verifySignal,
} from "@/lib/fundgraph/client";

const ADVANCED_POLL_INTERVAL_MS = 4_000;
const ADVANCED_POLL_MAX_MS = 60_000;

function statusClass(status: ReturnType<typeof deriveSignalReportStatus>): string {
  if (status === "verified") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "contested") return "border border-rose-200 bg-rose-50 text-rose-700";
  return "border border-slate-200 bg-slate-100 text-slate-700";
}

function confidenceClass(confidence: SignalReport["score"]["confidence"]): string {
  if (confidence === "high") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (confidence === "medium") return "border border-amber-200 bg-amber-50 text-amber-700";
  return "border border-rose-200 bg-rose-50 text-rose-700";
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function normalizeChipLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function stageChipTone(kind: "Company" | "Fund" | "Theme" | "Person" | "Signal"): string {
  if (kind === "Company") return "border border-sky-200 bg-sky-50 text-sky-700";
  if (kind === "Fund") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (kind === "Theme") return "border border-indigo-200 bg-indigo-50 text-indigo-700";
  if (kind === "Signal") return "border border-teal-200 bg-teal-50 text-teal-700";
  return "border border-amber-200 bg-amber-50 text-amber-700";
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

function mergeEvidenceLists(
  ...lists: Array<
    Array<{
      id: string;
      source_type: string;
      title: string;
      url: string;
      published_at: string;
      snippet: string;
      why_used: string;
      extracted_facts?: Array<{ field: string; value: string }>;
    }>
  >
) {
  const merged: Array<{
    id: string;
    source_type: string;
    title: string;
    url: string;
    published_at: string;
    snippet: string;
    why_used: string;
    extracted_facts?: Array<{ field: string; value: string }>;
  }> = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${(item.url || "").trim().toLowerCase()}|${item.title.trim().toLowerCase()}|${item.snippet
        .trim()
        .toLowerCase()
        .slice(0, 220)}`;
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function sourceToEvidenceItem(source: Source) {
  const sourceType = typeof source.metadata?.sourceType === "string" ? source.metadata.sourceType : source.type || "SOURCE";
  const cleanedSnippet = normalizeFundgraphText(source.rawText || "", 1000);
  const extractedFacts = fieldLikeBullets(cleanedSnippet, 4).map((entry) => {
    const [field, ...rest] = entry.split(":");
    return {
      field: (field || "Field").trim(),
      value: rest.join(":").trim() || entry,
    };
  });
  return {
    id: `ev-source-${source.id}`,
    source_type: String(sourceType),
    title: normalizeFundgraphText(source.title || "Signal citation", 200) || "Signal citation",
    url: source.url || "",
    published_at: source.createdAt,
    snippet: cleanedSnippet || "Citation text unavailable.",
    why_used: "Community citation added for signal validation.",
    extracted_facts: extractedFacts,
  };
}

function synthesizeSignal(
  prev: Signal,
  update: Partial<
    Pick<
      Signal,
      | "verifiedCount"
      | "verifyCount"
      | "verifies"
      | "disputedCount"
      | "disagreeCount"
      | "disagrees"
      | "bullishCount"
      | "neutralCount"
      | "bearishCount"
      | "upvotes"
      | "userStance"
    >
  >
): Signal {
  return {
    ...prev,
    ...update,
    verifiedCount: update.verifiedCount ?? prev.verifiedCount ?? prev.verifyCount ?? prev.verifies ?? 0,
    verifyCount: update.verifyCount ?? update.verifiedCount ?? prev.verifyCount ?? prev.verifiedCount ?? prev.verifies ?? 0,
    verifies: update.verifies ?? update.verifiedCount ?? prev.verifies ?? prev.verifiedCount ?? prev.verifyCount ?? 0,
    disputedCount: update.disputedCount ?? prev.disputedCount ?? prev.disagreeCount ?? prev.disagrees ?? 0,
    disagreeCount: update.disagreeCount ?? update.disputedCount ?? prev.disagreeCount ?? prev.disputedCount ?? prev.disagrees ?? 0,
    disagrees: update.disagrees ?? update.disputedCount ?? prev.disagrees ?? prev.disputedCount ?? prev.disagreeCount ?? 0,
    bullishCount: update.bullishCount ?? prev.bullishCount ?? prev.upvotes ?? 0,
    neutralCount: update.neutralCount ?? prev.neutralCount ?? 0,
    bearishCount: update.bearishCount ?? prev.bearishCount ?? 0,
    upvotes: update.upvotes ?? update.bullishCount ?? prev.upvotes ?? prev.bullishCount ?? 0,
  };
}

function advancedScoreTone(value: number): string {
  if (value >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value >= 50) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function AdvancedInsightSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
      <div className="h-18 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-18 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-18 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

export function SignalReportDrawer({
  open,
  signal,
  fundName,
  openAddCitationOnOpen = false,
  onClose,
  closeLabel = "Close",
  onSignalUpdated,
}: {
  open: boolean;
  signal: Signal;
  fundName?: string;
  openAddCitationOnOpen?: boolean;
  onClose: () => void;
  closeLabel?: string;
  onSignalUpdated?: (signal: Signal) => void;
}) {
  const { userId, userName, applyContributor } = useFundGraphState();
  const { isUnlocked, unlockSignal, unlockingId, unlockError } = useSignalUnlocks();
  const [workingSignal, setWorkingSignal] = useState(signal);
  const [report, setReport] = useState<SignalReport>(() => buildSignalReport(signal, { fundName }));
  const [focusedEvidenceId, setFocusedEvidenceId] = useState<string | null>(null);
  const [focusedGraphNodeId, setFocusedGraphNodeId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<"challenge" | "stance" | "add_source" | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedInsight, setAdvancedInsight] = useState<AdvancedSignalInsight | null>(signal.advancedInsight ?? null);
  const [advancedInsightStatus, setAdvancedInsightStatus] = useState<Signal["advancedInsightStatus"]>(
    signal.advancedInsightStatus ?? (signal.advancedInsight ? "ready" : undefined)
  );
  const [advancedInsightLoading, setAdvancedInsightLoading] = useState(false);
  const [advancedInsightMessage, setAdvancedInsightMessage] = useState<string | null>(signal.advancedInsightError ?? null);
  const [advancedFetchedOnce, setAdvancedFetchedOnce] = useState(false);
  const [advancedPollingTimedOut, setAdvancedPollingTimedOut] = useState(false);
  const [autoRevealAfterUnlock, setAutoRevealAfterUnlock] = useState(false);
  const [advancedInsightError, setAdvancedInsightError] = useState<string | null>(null);
  const signalContextKey = `${signal.id}::${fundName ?? ""}`;
  const signalContextRef = useRef(signalContextKey);
  const autoOpenedCitationSignalRef = useRef<string | null>(null);

  useEffect(() => {
    const shouldResetForNewSignal = signalContextRef.current !== signalContextKey;
    signalContextRef.current = signalContextKey;

    setWorkingSignal(signal);
    setReport(buildSignalReport(signal, { fundName }));
    setRequestError(null);
    if (shouldResetForNewSignal) {
      setFocusedEvidenceId(null);
      setFocusedGraphNodeId(null);
      setShowAdvanced(false);
      setAdvancedInsight(signal.advancedInsight ?? null);
      setAdvancedInsightStatus(signal.advancedInsightStatus ?? (signal.advancedInsight ? "ready" : undefined));
      setAdvancedInsightMessage(signal.advancedInsightError ?? null);
      setAdvancedFetchedOnce(false);
      setAdvancedPollingTimedOut(false);
      setAutoRevealAfterUnlock(false);
      setAdvancedInsightError(null);
      setAdvancedInsightLoading(false);
      return;
    }

    // Preserve expanded deep-analysis state for the same signal context, but accept fresher upstream insight payloads.
    if (signal.advancedInsight) {
      setAdvancedInsight(signal.advancedInsight);
      setAdvancedInsightStatus(signal.advancedInsightStatus ?? "ready");
      setAdvancedInsightMessage(signal.advancedInsightError ?? null);
      setAdvancedInsightError(null);
    } else if (signal.advancedInsightStatus === "preparing" || signal.advancedInsightStatus === "failed") {
      setAdvancedInsightStatus(signal.advancedInsightStatus);
      setAdvancedInsightMessage(signal.advancedInsightError ?? null);
    }
  }, [fundName, signal, signalContextKey]);

  useEffect(() => {
    if (!open) return;
    if (!openAddCitationOnOpen) return;
    if (autoOpenedCitationSignalRef.current === workingSignal.id) return;
    autoOpenedCitationSignalRef.current = workingSignal.id;
    setAddSourceOpen(true);
  }, [open, openAddCitationOnOpen, workingSignal.id]);

  const status = useMemo(() => deriveSignalReportStatus(report.verification), [report.verification]);
  const topEvidence = useMemo(() => report.evidence.slice(0, 3), [report.evidence]);
  const intelligenceUnlocked = useMemo(() => isUnlocked(workingSignal.id), [isUnlocked, workingSignal.id]);
  const allEntityChips = useMemo(() => {
    const candidates = [
      ...report.entities.companies.map((label) => ({ label, kind: "Company" as const })),
      ...report.entities.funds.map((label) => ({ label, kind: "Fund" as const })),
      ...report.entities.themes.map((label) => ({ label, kind: "Theme" as const })),
      ...report.entities.people.map((label) => ({ label, kind: "Person" as const })),
      ...(workingSignal.tags ?? []).map((label) => ({ label, kind: "Signal" as const })),
    ];
    const seen = new Set<string>();
    const unique: Array<{ label: string; kind: "Company" | "Fund" | "Theme" | "Person" | "Signal" }> = [];
    for (const candidate of candidates) {
      const normalized = normalizeChipLabel(candidate.label);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push({ ...candidate, label: candidate.label.trim() });
    }
    return unique;
  }, [report.entities.companies, report.entities.funds, report.entities.people, report.entities.themes, workingSignal.tags]);
  const entityChips = useMemo(() => allEntityChips.slice(0, 8), [allEntityChips]);
  const hiddenChipCount = useMemo(() => {
    return Math.max(0, allEntityChips.length - entityChips.length);
  }, [allEntityChips.length, entityChips.length]);
  const stanceCounts = useMemo(() => signalStanceCounts(workingSignal), [workingSignal]);
  const dominant = useMemo(() => dominantStance(stanceCounts), [stanceCounts]);
  const emitSignalUpdated = useCallback(
    (nextSignal: Signal) => {
      if (!onSignalUpdated) return;
      Promise.resolve().then(() => onSignalUpdated(nextSignal));
    },
    [onSignalUpdated]
  );

  const loadAdvancedInsight = useCallback(
    async (force = false) => {
      if (!intelligenceUnlocked) return;
      if (advancedInsightLoading) return;
      if (!force && advancedInsightStatus === "ready" && advancedInsight) return;
      const signalId = workingSignal.id;
      setAdvancedInsightLoading(true);
      setAdvancedInsightError(null);
      try {
        const response = await getSignalAdvancedInsight(signalId);
        setAdvancedFetchedOnce(true);
        setAdvancedInsightStatus(response.status);
        setAdvancedInsightMessage(response.message ?? null);
        if (response.status === "ready" && response.insight) {
          setAdvancedInsight(response.insight);
          setAdvancedPollingTimedOut(false);
        } else {
          setAdvancedInsight(null);
          if (response.status !== "preparing") {
            setAdvancedPollingTimedOut(false);
          }
        }
        const updatedAt = new Date().toISOString();
        let nextSignal: Signal | null = null;
        setWorkingSignal((prev) => {
          nextSignal =
            response.status === "ready" && response.insight
              ? {
                  ...prev,
                  advancedInsight: response.insight,
                  advancedInsightStatus: "ready",
                  advancedInsightError: undefined,
                  advancedInsightUpdatedAt: updatedAt,
                }
              : {
                  ...prev,
                  advancedInsight: undefined,
                  advancedInsightStatus: response.status,
                  advancedInsightError: response.status === "failed" ? response.message || "generation_failed" : undefined,
                  advancedInsightUpdatedAt: updatedAt,
                };
          return nextSignal;
        });
        if (nextSignal) {
          emitSignalUpdated(nextSignal);
        }
      } catch (error) {
        setAdvancedInsightError(error instanceof Error ? error.message : "Unable to load deep signal analysis.");
      } finally {
        setAdvancedInsightLoading(false);
      }
    },
    [advancedInsight, advancedInsightLoading, advancedInsightStatus, emitSignalUpdated, intelligenceUnlocked, workingSignal.id]
  );

  useEffect(() => {
    if (!open) return;
    if (!intelligenceUnlocked) return;
    if (!showAdvanced) return;
    if (advancedFetchedOnce) return;
    void loadAdvancedInsight();
  }, [advancedFetchedOnce, intelligenceUnlocked, loadAdvancedInsight, open, showAdvanced]);

  useEffect(() => {
    if (!open) return;
    if (!intelligenceUnlocked) return;
    if (!showAdvanced) return;
    if (advancedInsightStatus !== "preparing") return;
    if (advancedPollingTimedOut) return;

    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      if (Date.now() - startedAt >= ADVANCED_POLL_MAX_MS) {
        setAdvancedPollingTimedOut(true);
        globalThis.clearInterval(timer);
        return;
      }
      void loadAdvancedInsight(true);
    }, ADVANCED_POLL_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [
    advancedInsightStatus,
    advancedPollingTimedOut,
    intelligenceUnlocked,
    loadAdvancedInsight,
    open,
    showAdvanced,
  ]);

  useEffect(() => {
    if (!autoRevealAfterUnlock) return;
    if (!intelligenceUnlocked) return;
    setShowAdvanced(true);
    setAdvancedFetchedOnce(false);
    setAdvancedPollingTimedOut(false);
    setAutoRevealAfterUnlock(false);
  }, [autoRevealAfterUnlock, intelligenceUnlocked]);

  useEffect(() => {
    if (!autoRevealAfterUnlock) return;
    if (!unlockError) return;
    setAutoRevealAfterUnlock(false);
  }, [autoRevealAfterUnlock, unlockError]);

  useEffect(() => {
    if (!open) return;
    const signalId = workingSignal.id;
    let cancelled = false;

    async function hydrateSignalEvidence() {
      try {
        const response = await getSignalSources(signalId);
        const mapped = response.sources.map(sourceToEvidenceItem);
        if (cancelled) return;
        if (response.signal) {
          const nextSignal = {
            ...response.signal,
            userStance: response.signal.userStance ?? workingSignal.userStance,
          };
          const nextReport = buildSignalReport(nextSignal, { fundName });
          nextReport.evidence = mergeEvidenceLists(mapped, nextReport.evidence);
          setWorkingSignal(nextSignal);
          setReport(nextReport);
          emitSignalUpdated(nextSignal);
          return;
        }
        if (!mapped.length) return;
        setReport((prev) => ({
          ...prev,
          evidence: mergeEvidenceLists(mapped, prev.evidence),
        }));
      } catch {
        // keep existing evidence if source hydration fails
      }
    }

    void hydrateSignalEvidence();
    return () => {
      cancelled = true;
    };
  }, [emitSignalUpdated, fundName, open, workingSignal.id, workingSignal.userStance]);

  if (!open) return null;

  function updateFromSignal(
    nextSignal: Signal,
    additionalChallenge?: SignalReport["challenges"][number],
    additionalEvidence?: SignalReport["evidence"][number]
  ) {
    const mergedSignal = {
      ...nextSignal,
      userStance: nextSignal.userStance ?? workingSignal.userStance,
    };
    const nextReport = buildSignalReport(mergedSignal, { fundName });
    nextReport.evidence = mergeEvidenceLists(additionalEvidence ? [additionalEvidence] : [], report.evidence, nextReport.evidence);
    if (additionalChallenge) {
      nextReport.challenges = [additionalChallenge, ...nextReport.challenges];
      nextReport.verification.activity_log = [
        {
          type: "challenge",
          user_display: additionalChallenge.challenger_display,
          ts: new Date().toISOString(),
        },
        ...nextReport.verification.activity_log,
      ];
    }
    setWorkingSignal(mergedSignal);
    setReport(nextReport);
    setAdvancedInsight(mergedSignal.advancedInsight ?? null);
    setAdvancedInsightStatus(mergedSignal.advancedInsightStatus ?? (mergedSignal.advancedInsight ? "ready" : undefined));
    setAdvancedInsightMessage(mergedSignal.advancedInsightError ?? null);
    setAdvancedFetchedOnce(false);
    setAdvancedPollingTimedOut(false);
    setAdvancedInsightError(null);
    emitSignalUpdated(mergedSignal);
  }

  async function retryAdvancedGeneration() {
    if (!intelligenceUnlocked) return;
    if (advancedInsightLoading) return;
    setAdvancedInsightLoading(true);
    setAdvancedInsightError(null);
    setAdvancedPollingTimedOut(false);
    try {
      const response = await refreshSignalAdvancedInsight(workingSignal.id);
      setAdvancedFetchedOnce(true);
      setAdvancedInsightStatus(response.status);
      setAdvancedInsightMessage(response.message ?? null);
      setAdvancedInsight(null);
      const nextSignal: Signal = {
        ...workingSignal,
        advancedInsight: undefined,
        advancedInsightStatus: response.status,
        advancedInsightError: undefined,
        advancedInsightUpdatedAt: new Date().toISOString(),
      };
      setWorkingSignal(nextSignal);
      emitSignalUpdated(nextSignal);
    } catch (error) {
      setAdvancedInsightError(error instanceof Error ? error.message : "Unable to retry deep signal analysis.");
    } finally {
      setAdvancedInsightLoading(false);
    }
  }

  async function unlockAndRevealDeepAnalysis() {
    setAutoRevealAfterUnlock(true);
    await unlockSignal(workingSignal.id);
  }

  async function submitStance(stance: SignalStanceType) {
    if (actionBusy || stance === (workingSignal.userStance ?? null)) return;
    const previousSignal = workingSignal;
    const previousStance = workingSignal.userStance ?? null;
    const optimisticCounts = nextStanceCounts(stanceCounts, previousStance, stance);
    setActionBusy("stance");
    setRequestError(null);
    setWorkingSignal((prev) => ({
      ...prev,
      bullishCount: optimisticCounts.bullish,
      neutralCount: optimisticCounts.neutral,
      bearishCount: optimisticCounts.bearish,
      userStance: stance,
    }));
    try {
      const response = await setSignalStance(workingSignal.id, {
        userId,
        userName,
        stance,
      });
      if (response.gamification) {
        applyContributor({ userId: response.gamification.userId, gamification: response.gamification });
      }
      const nextSignal = synthesizeSignal(response.signal, {
        bullishCount: response.stanceCounts.bullish,
        neutralCount: response.stanceCounts.neutral,
        bearishCount: response.stanceCounts.bearish,
        userStance: response.stance,
      });
      updateFromSignal(nextSignal);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to set stance.");
      setWorkingSignal(previousSignal);
      setReport(buildSignalReport(previousSignal, { fundName }));
      emitSignalUpdated(previousSignal);
    } finally {
      setActionBusy(null);
    }
  }

  async function submitChallenge(payload: {
    note: string;
    sourceUrl?: string;
    sourceSnippet?: string;
  }) {
    setActionBusy("challenge");
    setRequestError(null);
    try {
      const response = await verifySignal(workingSignal.id, {
        userId,
        userName,
        vote: "dispute",
        note: payload.note,
      });
      applyContributor({ ...response.contributor, gamification: response.gamification });
      let updatedSignal = response.signal;
      if (payload.sourceUrl?.trim() || payload.sourceSnippet?.trim()) {
        const sourceResponse = await addSignalSource(workingSignal.id, {
          userId,
          sourceType: "PUBLIC_ARTICLE",
          visibility: "PUBLIC",
          title: "Dispute citation",
          url: payload.sourceUrl?.trim() || undefined,
          snippet: payload.sourceSnippet?.trim() || undefined,
          note: payload.note,
        });
        if (sourceResponse.gamification) {
          applyContributor({ userId: sourceResponse.gamification.userId, gamification: sourceResponse.gamification });
        }
        updatedSignal = sourceResponse.signal;
      }
      const challenge: SignalReport["challenges"][number] = {
        id: `challenge-local-${workingSignal.id}-${Date.now()}`,
        challenger_display: userName || "Community Member",
        claim: payload.note,
        citations: report.evidence.slice(0, 2).map((item) => item.id),
        impact: {
          score_delta: -6,
          confidence_change: report.score.confidence === "high" ? "High -> Medium" : "Medium -> Low",
        },
      };
      updateFromSignal(updatedSignal, challenge);
      setChallengeOpen(false);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to submit dispute.");
    } finally {
      setActionBusy(null);
    }
  }

  async function submitSource(payload: {
    sourceType: EvidenceSourceType;
    visibility: EvidenceVisibility;
    title?: string;
    url?: string;
    snippet?: string;
    note?: string;
    confidence?: EvidenceConfidenceTier;
  }) {
    setActionBusy("add_source");
    setRequestError(null);
    try {
      const response = await addSignalSource(workingSignal.id, {
        userId,
        sourceType: payload.sourceType,
        visibility: payload.visibility,
        title: payload.title,
        url: payload.url,
        snippet: payload.snippet,
        note: payload.note,
      });
      if (response.gamification) {
        applyContributor({ userId: response.gamification.userId, gamification: response.gamification });
      }
      updateFromSignal(response.signal, undefined, {
        id: `ev-source-${response.source.id}`,
        source_type: payload.sourceType,
        title: response.source.title,
        url: response.source.url || payload.url || "",
        published_at: response.source.createdAt || new Date().toISOString(),
        snippet: payload.snippet || payload.note || response.source.rawText || "Community source citation.",
        why_used: "Community citation added for signal validation.",
        extracted_facts: [],
      });
      setAddSourceOpen(false);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to add source.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 overflow-y-auto p-3 sm:p-6">
        <div className="mx-auto flex min-h-full w-full max-w-6xl items-start justify-center">
          <aside className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Signal Intelligence Report</p>
                <h2 className="mt-1 text-balance text-xl font-semibold text-slate-900 sm:text-[1.65rem]">{report.signal.title}</h2>
                <p className="mt-1 text-xs text-slate-500">Created {formatCreatedAt(report.signal.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {closeLabel}
              </button>
            </div>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap gap-2">
                {entityChips.map((item) => (
                  <span key={`${item.kind}-${item.label}`} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${stageChipTone(item.kind)}`}>
                    {item.label}
                  </span>
                ))}
                {hiddenChipCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    +{hiddenChipCount} more
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-base leading-relaxed text-slate-700">{report.signal.claim}</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${statusClass(status)}`}>Status: {signalReportStatusLabel(status)}</div>
                <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${confidenceClass(report.score.confidence)}`}>
                  Confidence: {signalConfidenceLabel(report.score.confidence)}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Verifies: <span className="font-semibold text-slate-900">{report.verification.verified_count}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Citations: <span className="font-semibold text-slate-900">{report.evidence.length}</span>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <SignalPoll
                  current_user_vote={workingSignal.userStance ?? null}
                  bullish_count={stanceCounts.bullish}
                  neutral_count={stanceCounts.neutral}
                  bearish_count={stanceCounts.bearish}
                  total_votes={stanceCounts.total}
                  dominant_stance={dominant}
                  disabled={Boolean(actionBusy)}
                  on_vote={submitStance}
                />
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <button
                    type="button"
                    onClick={() => setChallengeOpen(true)}
                    disabled={Boolean(actionBusy)}
                    className="h-9 rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    {actionBusy === "challenge" ? "Submitting..." : "Dispute with evidence"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddSourceOpen(true)}
                    disabled={Boolean(actionBusy)}
                    className="h-9 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {actionBusy === "add_source" ? "Saving..." : "Add supporting citation"}
                  </button>
                  <p className="max-w-xs text-[11px] leading-relaxed text-slate-500 lg:text-right">
                    Improve signal quality by flagging contradictions or attaching a source that validates the claim.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-900">Evidence & Citations</h3>
              <div className="mt-3">
                <SignalEvidenceList evidence={topEvidence} focusedEvidenceId={focusedEvidenceId} maxItems={3} compact />
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-900">AI Quick Take</h3>
              <div className="mt-3">
                <SignalAISummary
                  assertion={report.signal.claim}
                  aiSummary={report.ai_summary}
                  evidence={topEvidence}
                  compact
                  onCitationClick={(citationId) => setFocusedEvidenceId(citationId)}
                />
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
              {intelligenceUnlocked ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Deep Signal Analysis</h3>
                      <p className="mt-1 text-xs text-slate-600">Unlocked for this signal.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvanced((prev) => {
                          const next = !prev;
                          if (next) {
                            setAdvancedFetchedOnce(false);
                            setAdvancedPollingTimedOut(false);
                          }
                          return next;
                        })
                      }
                      className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {showAdvanced ? "Hide deep analysis" : "Show deep analysis"}
                    </button>
                  </div>
                  {showAdvanced ? (
                    <div className="mt-4 space-y-4">
                      {advancedInsightLoading && advancedInsightStatus !== "preparing" && advancedInsightStatus !== "ready" ? (
                        <AdvancedInsightSkeleton />
                      ) : null}
                      {advancedInsightError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
                          <p className="text-xs font-semibold text-rose-700">{advancedInsightError}</p>
                          <button
                            type="button"
                            onClick={() => loadAdvancedInsight(true)}
                            className="mt-2 inline-flex h-8 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Retry
                          </button>
                        </div>
                      ) : null}
                      {!advancedInsightError && advancedInsightStatus === "preparing" ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold text-slate-900">Analysis preparing</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Building a richer readout with implications, scenarios, uncertainty framing, and related patterns.
                          </p>
                          <div className="mt-3">
                            <AdvancedInsightSkeleton />
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            {advancedPollingTimedOut
                              ? "Preparation is taking longer than expected. Retry generation to request a fresh pass."
                              : advancedInsightMessage || "This usually completes within a few seconds."}
                          </p>
                          {advancedPollingTimedOut ? (
                            <button
                              type="button"
                              onClick={retryAdvancedGeneration}
                              disabled={advancedInsightLoading}
                              className="mt-3 inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Retry generation
                            </button>
                          ) : null}
                        </section>
                      ) : null}
                      {!advancedInsightError && advancedInsightStatus === "failed" ? (
                        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                          <p className="text-sm font-semibold text-rose-700">Deep analysis generation failed</p>
                          <p className="mt-1 text-xs text-rose-700">
                            {advancedInsightMessage || "We could not generate a high-quality advanced analysis for this signal yet."}
                          </p>
                          <button
                            type="button"
                            onClick={retryAdvancedGeneration}
                            disabled={advancedInsightLoading}
                            className="mt-3 inline-flex h-8 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Retry generation
                          </button>
                        </section>
                      ) : null}
                      {!advancedInsightError && advancedInsightStatus === "ready" && advancedInsight ? (
                        <>
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Why this matters</h4>
                            <p className="mt-2 text-sm text-slate-700">{advancedInsight.implication_summary}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${advancedScoreTone(Math.round(report.score.signal_strength))}`}>
                                Confidence {Math.round(report.score.signal_strength)}
                              </div>
                              <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${advancedScoreTone(advancedInsight.materiality_score)}`}>
                                Materiality {advancedInsight.materiality_score} · {advancedInsight.materiality_label}
                              </div>
                              <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${advancedScoreTone(advancedInsight.novelty_score)}`}>
                                Novelty {advancedInsight.novelty_score}
                              </div>
                              <div
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${advancedScoreTone(
                                  Math.max(0, 100 - advancedInsight.risk_uncertainty_score)
                                )}`}
                              >
                                Risk / Uncertainty {advancedInsight.risk_uncertainty_score}
                              </div>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Generated {formatCreatedAt(advancedInsight.generated_at)}
                            </p>
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Analyst framing</h4>
                            <div className="mt-3 grid gap-2 xl:grid-cols-3">
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">{advancedInsight.bull_case}</div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">{advancedInsight.base_case}</div>
                              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">{advancedInsight.bear_case}</div>
                            </div>
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                              <p className="text-xs font-semibold text-slate-700">AI Analyst View</p>
                              <p className="mt-1 text-sm text-slate-700">{advancedInsight.analyst_note.summary}</p>
                              <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                                {advancedInsight.analyst_note.bullets.map((item, index) => (
                                  <li key={`analyst-bullet-${index + 1}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </section>

                          {advancedInsight.entity_impact.length ? (
                            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                              <h4 className="text-sm font-semibold text-slate-900">Entity impact</h4>
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {advancedInsight.entity_impact.map((item) => (
                                  <article key={item.entity_id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-slate-900">{item.entity_name}</p>
                                      {typeof item.relevance_score === "number" ? (
                                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${advancedScoreTone(item.relevance_score)}`}>
                                          Relevance {Math.round(item.relevance_score)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{item.entity_type}</p>
                                    <p className="mt-1 text-sm text-slate-700">{item.impact_summary}</p>
                                  </article>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Risks & uncertainty</h4>
                            <div className="mt-3 grid gap-3 xl:grid-cols-2">
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-xs font-semibold text-slate-700">Missing evidence</p>
                                <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                                  {advancedInsight.missing_evidence.map((item, index) => (
                                    <li key={`missing-${index + 1}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-xs font-semibold text-slate-700">What changes confidence</p>
                                <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                                  {advancedInsight.confidence_change_triggers.map((item, index) => (
                                    <li key={`trigger-${index + 1}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Network & related patterns</h4>
                            <p className="mt-2 text-sm text-slate-700">{advancedInsight.graph_insight_summary}</p>
                            <p className="mt-2 text-sm text-slate-700">{advancedInsight.historical_context}</p>
                            {advancedInsight.related_signals.length ? (
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {advancedInsight.related_signals.map((item) => (
                                  <article key={item.signal_id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</p>
                                    <p className="mt-1 text-[11px] text-slate-600">
                                      {item.relation_type.replace("_", " ")}
                                      {typeof item.similarity_score === "number" ? ` • similarity ${Math.round(item.similarity_score * 100)}%` : ""}
                                    </p>
                                  </article>
                                ))}
                              </div>
                            ) : null}
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">What to do next</h4>
                            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                              {advancedInsight.next_questions.map((item, index) => (
                                <li key={`next-question-${index + 1}`}>{item}</li>
                              ))}
                            </ul>
                          </section>

                          <details className="rounded-2xl border border-slate-200 bg-white p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Methodology & raw diagnostics</summary>
                            <div className="mt-4 space-y-4">
                              <SignalScoreBreakdown score={report.score} />
                              <SignalEvidenceGraph
                                graph={report.graph}
                                activeNodeId={focusedGraphNodeId}
                                onNodeClick={(node) => {
                                  setFocusedGraphNodeId(node.id);
                                  if (node.type === "evidence" && node.evidence_id) {
                                    setFocusedEvidenceId(node.evidence_id);
                                  }
                                }}
                              />
                              <SignalEvidenceList evidence={report.evidence} focusedEvidenceId={focusedEvidenceId} />
                              <SignalAISummary
                                assertion={report.signal.claim}
                                aiSummary={report.ai_summary}
                                evidence={report.evidence}
                                onCitationClick={(citationId) => setFocusedEvidenceId(citationId)}
                              />
                              <SignalEntityContext context={report.context} entities={report.entities} />
                              <SignalVerificationActivity verification={report.verification} />
                              <SignalChallengesPanel
                                challenges={report.challenges}
                                onCitationClick={(citationId) => setFocusedEvidenceId(citationId)}
                                onChallenge={() => setChallengeOpen(true)}
                              />
                            </div>
                          </details>
                        </>
                      ) : null}
                      {!advancedInsightError &&
                      !advancedInsightLoading &&
                      advancedInsightStatus !== "preparing" &&
                      advancedInsightStatus !== "failed" &&
                      advancedInsightStatus !== "ready" ? (
                        <AdvancedInsightSkeleton />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Deep Signal Analysis</h3>
                    <span aria-hidden="true" className="text-sm text-slate-400">🔒</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">Unlock implications, scenario analysis, related patterns, and next diligence steps.</p>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                    <button
                      type="button"
                      onClick={unlockAndRevealDeepAnalysis}
                      disabled={unlockingId === workingSignal.id}
                      className="h-12 w-full rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 text-sm font-semibold text-white hover:from-slate-800 hover:to-slate-700 disabled:opacity-60"
                    >
                      {unlockingId === workingSignal.id ? "Unlocking..." : "Unlock Deep Signal Analysis"}
                    </button>
                  </div>
                </>
              )}
            </section>
            {unlockError ? <p className="mt-3 text-xs text-rose-700">{unlockError}</p> : null}
            {requestError ? <p className="mt-3 text-xs text-rose-700">{requestError}</p> : null}
          </aside>
        </div>
      </div>

      <DisputeClaimModal
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        submitting={actionBusy === "challenge"}
        onSubmit={submitChallenge}
      />
      <AddSourceModal
        open={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        submitting={actionBusy === "add_source"}
        onSubmit={submitSource}
      />
    </div>
  );
}
