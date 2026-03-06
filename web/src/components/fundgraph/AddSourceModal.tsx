"use client";

import { useState } from "react";
import { EvidenceConfidenceTier, EvidenceSourceType, EvidenceVisibility } from "@/fundgraph/types";

const SOURCE_TYPES: EvidenceSourceType[] = [
  "PUBLIC_ARTICLE",
  "TWEET_THREAD",
  "PODCAST",
  "YOUTUBE_VIDEO",
  "PASTED_TEXT",
  "PRIVATE_INTEL",
  "FOUNDER_NOTE",
  "LP_NOTE",
  "GP_NOTE",
  "FUND_DECK",
  "OTHER",
];
const VISIBILITIES: EvidenceVisibility[] = ["PUBLIC", "PRIVATE", "ANONYMOUS"];
const CONFIDENCE: EvidenceConfidenceTier[] = ["LOW", "MEDIUM", "HIGH"];

export function AddSourceModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    sourceType: EvidenceSourceType;
    visibility: EvidenceVisibility;
    title?: string;
    url?: string;
    snippet?: string;
    note?: string;
    confidence?: EvidenceConfidenceTier;
  }) => Promise<void>;
  submitting?: boolean;
}) {
  const [sourceType, setSourceType] = useState<EvidenceSourceType>("PUBLIC_ARTICLE");
  const [visibility, setVisibility] = useState<EvidenceVisibility>("PUBLIC");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [snippet, setSnippet] = useState("");
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState<EvidenceConfidenceTier>("MEDIUM");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (!snippet.trim() && !note.trim()) {
      setError("Add a snippet or note.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        sourceType,
        visibility,
        title: title.trim() || undefined,
        url: url.trim() || undefined,
        snippet: snippet.trim() || undefined,
        note: note.trim() || undefined,
        confidence,
      });
      onClose();
      setTitle("");
      setUrl("");
      setSnippet("");
      setNote("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add source.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Add Citation</h3>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            Close
          </button>
        </div>
        <p className="mt-2 text-xs text-emerald-700">If your citation is accepted after review, you may receive a contributor reward.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-600">
            Source type
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as EvidenceSourceType)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-900">
              {SOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Visibility
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as EvidenceVisibility)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-900">
              {VISIBILITIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Confidence
            <select value={confidence} onChange={(e) => setConfidence(e.target.value as EvidenceConfidenceTier)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs text-slate-900">
              {CONFIDENCE.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Source URL (optional)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900" />
        </div>
        <textarea value={snippet} onChange={(e) => setSnippet(e.target.value)} rows={3} placeholder="Citation snippet" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" />
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={submit} disabled={submitting} className="h-9 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-60">
            {submitting ? "Saving..." : "Add citation"}
          </button>
        </div>
      </div>
    </div>
  );
}
