"use client";

import { useState } from "react";
import { MemoTimeWindow, MemoType } from "@/fundgraph/types";

export type MemoConfig = {
  memoType: MemoType;
  includeSignals: boolean;
  includePortfolio: boolean;
  includeGraphContext: boolean;
  includeCommunityDiscussion: boolean;
  timeWindow: MemoTimeWindow;
};

export const DEFAULT_MEMO_CONFIG: MemoConfig = {
  memoType: "investment_memo",
  includeSignals: true,
  includePortfolio: true,
  includeGraphContext: true,
  includeCommunityDiscussion: true,
  timeWindow: "90d",
};

const MEMO_TYPE_OPTIONS: Array<{ value: MemoType; label: string; detail: string }> = [
  { value: "quick_brief", label: "Quick Brief", detail: "Fast 1-page synthesis for quick scanning." },
  { value: "investment_memo", label: "Investment Memo", detail: "Default full decision memo." },
  { value: "deep_diligence", label: "Deep Diligence Memo", detail: "Long-form with deeper risk coverage." },
];

const WINDOW_OPTIONS: Array<{ value: MemoTimeWindow; label: string }> = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all_time", label: "All time" },
];

export function GenerateMemoModal({
  open,
  subjectLabel,
  confirmLabel = "Generate",
  loading = false,
  initialConfig = DEFAULT_MEMO_CONFIG,
  onClose,
  onGenerate,
}: {
  open: boolean;
  subjectLabel: string;
  confirmLabel?: string;
  loading?: boolean;
  initialConfig?: MemoConfig;
  onClose: () => void;
  onGenerate: (config: MemoConfig) => Promise<void> | void;
}) {
  const [config, setConfig] = useState<MemoConfig>(initialConfig);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />

      <div className="absolute inset-x-4 top-10 mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Generate Investment Memo</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{subjectLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Memo Type</p>
            <div className="mt-2 space-y-2">
              {MEMO_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`block cursor-pointer rounded-xl border px-3 py-2 text-sm ${
                    config.memoType === option.value ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="memo-type"
                    className="sr-only"
                    checked={config.memoType === option.value}
                    onChange={() => setConfig((current) => ({ ...current, memoType: option.value }))}
                  />
                  <span className="font-semibold text-slate-900">{option.label}</span>
                  <span className="mt-1 block text-xs text-slate-600">{option.detail}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Include</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Signals"
                checked={config.includeSignals}
                onChange={(checked) => setConfig((current) => ({ ...current, includeSignals: checked }))}
              />
              <Toggle
                label="Portfolio"
                checked={config.includePortfolio}
                onChange={(checked) => setConfig((current) => ({ ...current, includePortfolio: checked }))}
              />
              <Toggle
                label="Graph context"
                checked={config.includeGraphContext}
                onChange={(checked) => setConfig((current) => ({ ...current, includeGraphContext: checked }))}
              />
              <Toggle
                label="Community discussion"
                checked={config.includeCommunityDiscussion}
                onChange={(checked) => setConfig((current) => ({ ...current, includeCommunityDiscussion: checked }))}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Time Window</p>
            <div className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setConfig((current) => ({ ...current, timeWindow: option.value }))}
                  className={`rounded-full px-3 py-1 ${
                    config.timeWindow === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onGenerate(config)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            {loading ? "Generating..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-slate-900" />
    </label>
  );
}
