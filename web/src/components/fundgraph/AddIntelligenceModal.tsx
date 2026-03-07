"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFundGraphState } from "@/fundgraph/state";
import { createSignal } from "@/lib/fundgraph/client";

type FundOption = {
  id: string;
  name: string;
};

export function AddIntelligenceModal({
  open,
  onClose,
  funds,
}: {
  open: boolean;
  onClose: () => void;
  funds: FundOption[];
}) {
  const router = useRouter();
  const { userId, userName, applyContributor } = useFundGraphState();
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [confidence, setConfidence] = useState(72);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceSnippet, setEvidenceSnippet] = useState("");
  const [posted, setPosted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    // Reset transient publish status when the modal closes so success text
    // only appears after a fresh publish action.
    setPosted(false);
    setSubmitError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!funds.length) {
      setFundId("");
      return;
    }
    const stillValid = funds.some((entry) => entry.id === fundId);
    if (!stillValid) {
      setFundId(funds[0]!.id);
    }
  }, [fundId, funds, open]);

  const canSubmit = title.trim().length >= 5 && summary.trim().length >= 15 && Boolean(fundId.trim());

  const selectedFundName = useMemo(() => funds.find((f) => f.id === fundId)?.name ?? "Selected fund", [fundId, funds]);

  function normalizeEvidenceUrl(value: string): string | undefined {
    const raw = value.trim();
    if (!raw) return undefined;
    try {
      return new URL(raw).toString();
    } catch {
      try {
        return new URL(`https://${raw}`).toString();
      } catch {
        return undefined;
      }
    }
  }

  if (!open) return null;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const normalizedEvidenceUrl = normalizeEvidenceUrl(evidenceUrl);
      if (evidenceUrl.trim() && !normalizedEvidenceUrl) {
        setSubmitError("Evidence URL is invalid. Use a valid link like https://example.com.");
        return;
      }
      const response = await createSignal({
        fundId,
        title: title.trim(),
        summary: summary.trim(),
        confidence: Math.max(0.4, Math.min(0.98, confidence / 100)),
        evidenceUrl: normalizedEvidenceUrl,
        evidenceSnippet: evidenceSnippet.trim() || undefined,
        userId,
        userName,
      });
      applyContributor({ ...response.contributor, gamification: response.gamification });
      setPosted(true);
      setTitle("");
      setSummary("");
      setEvidenceUrl("");
      setEvidenceSnippet("");
      setConfidence(72);
      onClose();
      router.push(`/cerebrosfund/signals?signalId=${encodeURIComponent(response.signal.id)}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish signal.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Publish New Signal</div>
            <h3 className="mt-1 text-2xl font-semibold text-slate-900">Share a structured signal</h3>
            <p className="mt-1 text-sm text-slate-600">Fast publish flow. Signals are reviewed, and rewards are applied after verification.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {posted ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Thank you. Your signal was submitted for {selectedFundName} and is pending verification. Reward points are pending review.
          </div>
        ) : null}
        {submitError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {submitError}
          </div>
        ) : null}
        {!funds.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No funds are loaded yet. Refresh the page once fund data is available.
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Fund</span>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              disabled={!funds.length}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Confidence</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={40}
                max={98}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-slate-900"
              />
              <div className="w-12 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{confidence}%</div>
            </div>
          </label>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block text-sm text-slate-700">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Signal Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Portfolio markdown risk moderating in AI infra"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <label className="block text-sm text-slate-700">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="What changed, why it matters, and what signal strength you assign."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-slate-700">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Evidence URL (optional)</span>
              <input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Evidence Snippet (optional)</span>
              <input
                value={evidenceSnippet}
                onChange={(e) => setEvidenceSnippet(e.target.value)}
                placeholder="Direct quote or channel check"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {canSubmit ? "Tip: adding evidence increases community verification speed." : "Required: fund, title (5+ chars), summary (15+ chars)."}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!funds.length || !canSubmit || submitting}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Publishing..." : "Publish New Signal"}
          </button>
        </div>
      </div>
    </div>
  );
}
