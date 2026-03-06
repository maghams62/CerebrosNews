"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFundGraphState } from "@/fundgraph/state";
import { getMemo, listFunds, updateMemo } from "@/lib/fundgraph/client";
import { editorHtmlToMarkdown, markdownToEditorHtml, normalizeEditorHtml } from "@/lib/fundgraph/memoEditor";
import { Memo } from "@/lib/fundgraph/types";

type ToastState = { tone: "success" | "error"; message: string } | null;
type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1200;

export function MemoViewer({ memoId }: { memoId: string }) {
  const { userId } = useFundGraphState();
  const [memo, setMemo] = useState<Memo | null>(null);
  const [fundNamesById, setFundNamesById] = useState<Record<string, string>>({});
  const [editorHtml, setEditorHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSavedHtmlRef = useRef("");
  const autosaveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const canEdit = useMemo(() => {
    if (!memo) return false;
    if (!memo.userId) return true;
    return memo.userId === userId;
  }, [memo, userId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const memoResponse = await getMemo(memoId);
        if (cancelled) return;

        const nextMemo = memoResponse.memo;
        const initialHtml = nextMemo.editorHtml?.trim() ? nextMemo.editorHtml : markdownToEditorHtml(nextMemo.memoMarkdown ?? "");
        setMemo(nextMemo);
        setEditorHtml(initialHtml);
        lastSavedHtmlRef.current = normalizeEditorHtml(initialHtml);
        setDirty(false);
        setSaveState("idle");
        setSaveError(null);
      } catch (fetchError) {
        if (cancelled) return;
        const message = fetchError instanceof Error ? fetchError.message : "Failed to load memo.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memoId]);

  useEffect(() => {
    if (!memo) return;
    let cancelled = false;
    (async () => {
      try {
        const fundsResponse = await listFunds();
        if (cancelled) return;
        const nameMap = Object.fromEntries(fundsResponse.funds.map((fund) => [fund.id, fund.name]));
        setFundNamesById(nameMap);
      } catch {
        // Load memo content even when fund metadata fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memo?.id]);

  useEffect(() => {
    if (!editorRef.current) return;
    const currentDom = normalizeEditorHtml(editorRef.current.innerHTML);
    const next = normalizeEditorHtml(editorHtml);
    if (currentDom !== next) {
      editorRef.current.innerHTML = editorHtml;
    }
  }, [editorHtml, memo?.id]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setDirty(normalizeEditorHtml(editorHtml) !== lastSavedHtmlRef.current);
  }, [editorHtml]);

  const createdLabel = useMemo(() => {
    if (!memo?.createdAt) return null;
    const parsed = new Date(memo.createdAt);
    if (Number.isNaN(parsed.getTime())) return memo.createdAt;
    return parsed.toLocaleString();
  }, [memo?.createdAt]);

  const editedLabel = useMemo(() => {
    if (!memo?.lastEditedAt) return null;
    const parsed = new Date(memo.lastEditedAt);
    if (Number.isNaN(parsed.getTime())) return memo.lastEditedAt;
    return parsed.toLocaleString();
  }, [memo?.lastEditedAt]);

  const fundNames = useMemo(() => {
    if (!memo?.fundIds?.length) return [];
    return memo.fundIds.map((fundId) => fundNamesById[fundId] ?? fundId);
  }, [fundNamesById, memo?.fundIds]);

  const primaryFundName = useMemo(() => {
    if (!memo?.primaryFundId) return null;
    return fundNamesById[memo.primaryFundId] ?? memo.primaryFundId;
  }, [fundNamesById, memo?.primaryFundId]);

  const currentMarkdown = useMemo(() => {
    return editorHtmlToMarkdown(editorHtml);
  }, [editorHtml]);

  const generationLabel = memo?.generationMode === "llm" ? "AI-generated draft" : "Auto-generated draft";

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ tone: "success", message: successMessage });
    } catch (clipboardError) {
      console.error("memo_copy_failed", clipboardError);
      setToast({ tone: "error", message: "Copy failed. Clipboard permission may be blocked." });
    }
  }

  function exportPdf() {
    window.print();
  }

  const syncFromEditor = useCallback(() => {
    if (!editorRef.current) return;
    setEditorHtml(editorRef.current.innerHTML);
    if (saveState === "saved") {
      setSaveState("idle");
    }
  }, [saveState]);

  const persistEdits = useCallback(
    async (reason: "autosave" | "manual") => {
      if (!memo || !canEdit) return;

      const normalized = normalizeEditorHtml(editorHtml);
      if (!normalized && reason === "autosave") return;
      if (normalized === lastSavedHtmlRef.current && reason === "autosave") return;

      if (savingRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      savingRef.current = true;
      setSaveState("saving");
      setSaveError(null);

      try {
        const markdown = editorHtmlToMarkdown(editorHtml);
        const response = await updateMemo(memo.id, {
          memoMarkdown: markdown,
          editorHtml: editorHtml || "<p></p>",
        });
        const updatedMemo = response.memo;
        const persistedHtml = updatedMemo.editorHtml?.trim() ? updatedMemo.editorHtml : editorHtml || "<p></p>";

        setMemo(updatedMemo);
        setEditorHtml(persistedHtml);
        lastSavedHtmlRef.current = normalizeEditorHtml(persistedHtml);
        setDirty(false);
        setSaveState("saved");
        if (reason === "manual") {
          setToast({ tone: "success", message: "Memo saved." });
        }
      } catch (saveErr) {
        const message = saveErr instanceof Error ? saveErr.message : "Save failed.";
        setSaveError(message === "request_timeout" ? "Save request timed out. Retry." : message);
        setSaveState("error");
      } finally {
        savingRef.current = false;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          void persistEdits("autosave");
        }
      }
    },
    [canEdit, editorHtml, memo]
  );

  useEffect(() => {
    if (!memo || !canEdit || !dirty) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistEdits("autosave");
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [canEdit, dirty, memo, persistEdits]);

  function applyCommand(command: string, value?: string) {
    if (!canEdit) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function applyInlineCode() {
    if (!canEdit) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const selectedText = selection.toString();
    if (!selectedText.trim()) return;
    document.execCommand("insertHTML", false, `<code>${selectedText}</code>`);
    syncFromEditor();
  }

  const saveStatusLabel =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Save failed"
          : dirty
            ? "Unsaved changes"
            : "Ready";

  return (
    <section className="memo-print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {toast ? (
        <div
          className={`memo-print-hidden fixed top-5 right-5 z-50 rounded-xl px-3 py-2 text-xs font-semibold shadow ${
            toast.tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {memo?.artifactType === "watchlist_brief" ? "Watchlist Brief" : "Investment Memo"}
          </h1>
          <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            {generationLabel}
          </div>
          <p className="mt-1 text-xs text-slate-500">Memo ID: {memoId}</p>
          {createdLabel ? <p className="mt-1 text-xs text-slate-500">Created: {createdLabel}</p> : null}
          {editedLabel ? <p className="mt-1 text-xs text-slate-500">Last edited: {editedLabel}</p> : null}
          {primaryFundName ? <p className="mt-2 text-sm text-slate-600">Subject: {primaryFundName}</p> : null}
          {fundNames.length && !primaryFundName ? <p className="mt-2 text-sm text-slate-600">Funds: {fundNames.join(", ")}</p> : null}
          {!canEdit && memo ? <p className="mt-2 text-xs font-semibold text-amber-700">Read-only: only the memo owner can edit.</p> : null}
        </div>

        <div className="memo-print-hidden flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(window.location.href, "Memo link copied.")}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Copy Link
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(currentMarkdown || memo?.memoMarkdown || "", "Markdown copied.")}
            disabled={!memo}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Copy Markdown
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void persistEdits("manual")}
              disabled={!dirty || saveState === "saving"}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save
            </button>
          ) : null}
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Export PDF
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          Loading memo...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Memo loading failed: {error}
        </div>
      ) : null}

      {!loading && !error && memo ? (
        <article className="mt-5">
          {canEdit ? (
            <div className="memo-print-hidden mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => applyCommand("formatBlock", "<h2>")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                H2
              </button>
              <button
                type="button"
                onClick={() => applyCommand("formatBlock", "<h3>")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                H3
              </button>
              <button
                type="button"
                onClick={() => applyCommand("bold")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => applyCommand("italic")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => applyCommand("insertUnorderedList")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bullets
              </button>
              <button
                type="button"
                onClick={() => applyCommand("insertOrderedList")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Numbered
              </button>
              <button
                type="button"
                onClick={() => applyCommand("formatBlock", "<blockquote>")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Quote
              </button>
              <button
                type="button"
                onClick={applyInlineCode}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Code
              </button>
              <div className="ml-auto text-xs font-semibold text-slate-500">{saveStatusLabel}</div>
              {saveState === "error" ? (
                <button
                  type="button"
                  onClick={() => void persistEdits("manual")}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Retry Save
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            ref={editorRef}
            contentEditable={canEdit}
            suppressContentEditableWarning
            onInput={syncFromEditor}
            className={`memo-editor memo-markdown min-h-[340px] rounded-2xl border p-4 ${canEdit ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}
          />

          {saveError ? <p className="mt-2 text-xs font-semibold text-rose-700">{saveError}</p> : null}

          {memo.citations.length ? (
            <section className="mt-8 border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold tracking-[0.08em] text-slate-700 uppercase">Evidence</h2>
              <ul className="mt-3 space-y-2">
                {memo.citations.map((citation) => (
                  <li key={citation.id} className="text-sm text-slate-700">
                    <span className="font-semibold">{citation.title}:</span> {citation.snippet}{" "}
                    {citation.url ? (
                      <a href={citation.url} target="_blank" rel="noreferrer" className="text-slate-900 underline">
                        source
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
