"use client";

import { useState } from "react";

export function DisputeClaimModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { note: string; sourceUrl?: string; sourceSnippet?: string }) => Promise<void>;
  submitting?: boolean;
}) {
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSnippet, setSourceSnippet] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (!note.trim()) {
      setError("Add a dispute reason.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        note: note.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        sourceSnippet: sourceSnippet.trim() || undefined,
      });
      setNote("");
      setSourceUrl("");
      setSourceSnippet("");
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit dispute.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Dispute Claim or Signal</h3>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            Close
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-700">If your dispute is approved after review, you may receive a contributor reward.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Why do you dispute this claim?"
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Cite source URL (optional)"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
          />
          <input
            value={sourceSnippet}
            onChange={(e) => setSourceSnippet(e.target.value)}
            placeholder="Citation snippet (optional)"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
          />
        </div>
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={submit} disabled={submitting} className="h-9 rounded-full bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
            {submitting ? "Submitting..." : "Submit dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}
