"use client";

import React, { useEffect } from "react";
import { CoverageSource } from "@/types/insights";

function relativeTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SourceTypeBadge({ t }: { t: CoverageSource["sourceType"] }) {
  const map: Record<CoverageSource["sourceType"], string> = {
    editorial: "bg-slate-100 text-slate-700",
    community: "bg-slate-100 text-slate-700",
    primary: "bg-slate-100 text-slate-700",
    social: "bg-indigo-50 text-indigo-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[t]}`}>{t}</span>;
}

export function SourcesPanel({
  title,
  sources,
  open,
  onClose,
}: {
  title: string | null;
  sources: CoverageSource[] | null;
  open: boolean;
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

  if (!open || !title || !sources) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3">
      <div className="w-full max-w-[430px] md:max-w-[min(900px,75vw)] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Sources</div>
            <div className="text-sm font-semibold text-slate-900 line-clamp-2">{title}</div>
          </div>
          <button
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
            onClick={onClose}
            aria-label="Close sources"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          <div className="space-y-3">
            {sources.map((s) => (
              <div key={s.url} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {relativeTimeFromIso(s.publishedAt)} • <SourceTypeBadge t={s.sourceType} />
                    </div>
                  </div>
                  <a
                    className="shrink-0 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 text-xs text-slate-500 border-t border-slate-200">
          Tip: Press <span className="font-semibold text-slate-700">Esc</span> to close.
        </div>
      </div>
    </div>
  );
}

