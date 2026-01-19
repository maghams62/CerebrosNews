"use client";

import React, { useEffect } from "react";
import { InsightBundle } from "@/types/insights";
import { ToneBadge } from "./ToneBadge";
import { StanceBadge } from "./StanceBadge";

export function PerspectivesPanel({
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
            <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Compare</div>
            <div className="text-sm font-semibold text-slate-900 line-clamp-2">{title}</div>
          </div>
          <button
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
            onClick={onClose}
            aria-label="Close compare"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-6">
          <section className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Narrative diff</div>
            <div className="space-y-3">
              {insights.perspectives.lenses.map((lens) => (
                <div key={lens.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{lens.label}</div>
                      <div className="mt-1 text-sm text-slate-700">{lens.summary}</div>
                    </div>
                    <ToneBadge tone={lens.tone} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lens.keywords.slice(0, 6).map((k) => (
                      <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Opposing views</div>
            <div className="space-y-3">
              {insights.perspectives.opposingArticles.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 line-clamp-2">{a.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{a.sourceName}</div>
                    </div>
                    <StanceBadge stance={a.stance} />
                  </div>
                  <div className="mt-2 text-sm text-slate-700 line-clamp-3">{a.snippet}</div>
                  <div className="mt-3">
                    <a
                      className="inline-flex rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="px-5 py-3 text-xs text-slate-500 border-t border-slate-200">
          Tip: Press <span className="font-semibold text-slate-700">Esc</span> to close.
        </div>
      </div>
    </div>
  );
}

