"use client";

import React, { useState } from "react";
import { Switch } from "@/components/profile/Switch";
import { Chip } from "@/components/profile/Chip";

export function ConnectorCard({
  title,
  icon,
  enabled,
  onToggle,
  topics,
  onAddTopic,
  onRemoveTopic,
  onTest,
  testLabel = "Test",
  footer,
  statusLabel = "Connected",
  addPlaceholder = "Add topic",
  lastSyncLabel,
  badge,
  helperText,
}: {
  title: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  topics: string[];
  onAddTopic: (topic: string) => void;
  onRemoveTopic: (topic: string) => void;
  onTest: () => void;
  testLabel?: string;
  footer: string;
  statusLabel?: string;
  addPlaceholder?: string;
  lastSyncLabel?: string;
  badge?: string;
  helperText?: string;
}) {
  const [draft, setDraft] = useState("");

  function submitDraft() {
    const cleaned = draft.trim();
    if (!cleaned) return;
    onAddTopic(cleaned);
    setDraft("");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {badge ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {badge}
              </span>
            ) : null}
          </div>
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
            enabled ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-500"
          }`}
        >
          {enabled ? "✓" : "–"}
        </span>
        <span>{enabled ? statusLabel : "Disconnected"}</span>
        {lastSyncLabel ? <span className="text-slate-400">• {lastSyncLabel}</span> : null}
      </div>
      {helperText ? <div className="mt-2 text-xs text-slate-500">{helperText}</div> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {topics.map((t) => (
          <Chip key={t} label={t} onRemove={() => onRemoveTopic(t)} />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDraft();
            }
          }}
          placeholder={addPlaceholder}
          className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          onClick={onTest}
        >
          {testLabel}
        </button>
      </div>

      <div className="mt-3 text-xs text-slate-500">{footer}</div>
    </div>
  );
}
