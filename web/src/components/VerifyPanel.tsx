"use client";

import React, { useEffect, useState } from "react";
import { InsightBundle } from "@/types/insights";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function VerifyPanel({
  title,
  open,
  insights,
  onClose,
}: {
  title: string | null;
  open: boolean;
  insights: InsightBundle | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !insights || !title) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3">
      <div className="w-full max-w-[430px] md:max-w-[min(900px,75vw)] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Verify</div>
            <div className="text-sm font-semibold text-slate-900 line-clamp-2">{title}</div>
          </div>
          <button
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
            onClick={onClose}
            aria-label="Close verify"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {insights.verify.claims.map((c) => {
            const isOpen = expanded.has(c.id);
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{c.claimText}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {c.supportCount} sources • {c.evidenceType}
                    </div>
                  </div>
                  <ConfidenceBadge confidence={c.confidence} />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  >
                    {isOpen ? "Hide evidence" : "Show evidence"}
                  </button>
                </div>

                {isOpen ? (
                  <div className="mt-3 space-y-3">
                    {c.evidence.map((e) => (
                      <div key={e.id} className="rounded-lg bg-slate-50 p-3">
                        <div className="text-sm text-slate-700">{e.snippet}</div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>{e.sourceName}</span>
                          <a className="font-semibold text-indigo-600 hover:text-indigo-700" href={e.url} target="_blank" rel="noreferrer">
                            View source
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 text-xs text-slate-500 border-t border-slate-200">
          Tip: Press <span className="font-semibold text-slate-700">Esc</span> to close.
        </div>
      </div>
    </div>
  );
}

