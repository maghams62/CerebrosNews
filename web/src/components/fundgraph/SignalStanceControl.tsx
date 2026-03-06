"use client";

import { SignalStanceType } from "@/fundgraph/types";

const STANCE_OPTIONS: Array<{ key: SignalStanceType; label: string; tone: string; activeTone: string }> = [
  { key: "bullish", label: "Bullish", tone: "border-emerald-200 text-emerald-700", activeTone: "bg-emerald-600 text-white border-emerald-600" },
  { key: "neutral", label: "Neutral", tone: "border-slate-200 text-slate-700", activeTone: "bg-slate-700 text-white border-slate-700" },
  { key: "bearish", label: "Bearish", tone: "border-rose-200 text-rose-700", activeTone: "bg-rose-600 text-white border-rose-600" },
];

export function SignalStanceControl({
  activeStance,
  counts,
  disabled = false,
  onSelect,
  compact = false,
}: {
  activeStance?: SignalStanceType | null;
  counts: { bullish: number; neutral: number; bearish: number };
  disabled?: boolean;
  onSelect: (stance: SignalStanceType) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "items-center"}`}>
      {STANCE_OPTIONS.map((option) => {
        const count = option.key === "bullish" ? counts.bullish : option.key === "neutral" ? counts.neutral : counts.bearish;
        const active = activeStance === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect(option.key)}
            disabled={disabled}
            className={`inline-flex items-center gap-1 rounded-full border px-3 text-xs font-semibold disabled:opacity-60 ${
              compact ? "h-8" : "h-9"
            } ${
              active ? option.activeTone : `bg-white hover:bg-slate-50 ${option.tone}`
            }`}
          >
            <span>{option.label}</span>
            <span className={`${active ? "text-white/90" : "opacity-80"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
