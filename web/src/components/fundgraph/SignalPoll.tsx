"use client";

import { useEffect, useRef, useState } from "react";
import { SignalStanceType } from "@/fundgraph/types";

type DominantStance = SignalStanceType | "mixed" | "none";

const STANCE_OPTIONS: Array<{
  key: SignalStanceType;
  label: string;
  activeTone: string;
}> = [
  { key: "bullish", label: "Bullish", activeTone: "border-emerald-300 bg-emerald-100 text-emerald-800" },
  { key: "neutral", label: "Neutral", activeTone: "border-slate-300 bg-slate-200 text-slate-800" },
  { key: "bearish", label: "Bearish", activeTone: "border-rose-300 bg-rose-100 text-rose-800" },
];

function titleCaseStance(stance: DominantStance): string {
  if (stance === "bullish") return "Bullish";
  if (stance === "neutral") return "Neutral";
  if (stance === "bearish") return "Bearish";
  if (stance === "mixed") return "Mixed";
  return "Neutral";
}

function stancePercent(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const from = previousValueRef.current;
    const to = value;
    if (from === to) {
      return;
    }

    const durationMs = 260;
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(from + (to - from) * eased);
      setDisplay(nextValue);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        previousValueRef.current = to;
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [value]);

  return <span>{display}</span>;
}

export function SignalPoll({
  current_user_vote,
  bullish_count,
  neutral_count,
  bearish_count,
  total_votes,
  dominant_stance,
  disabled = false,
  on_vote,
}: {
  current_user_vote: SignalStanceType | null;
  bullish_count: number;
  neutral_count: number;
  bearish_count: number;
  total_votes: number;
  dominant_stance: DominantStance;
  disabled?: boolean;
  on_vote: (stance: SignalStanceType) => Promise<void> | void;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  function triggerFeedback() {
    setShowFeedback(true);
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setShowFeedback(false);
    }, 1500);
  }

  const bullishPct = stancePercent(bullish_count, total_votes);
  const neutralPct = stancePercent(neutral_count, total_votes);
  const bearishPct = stancePercent(bearish_count, total_votes);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-semibold text-slate-700">What&apos;s your take?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {STANCE_OPTIONS.map((option) => {
          const active = current_user_vote === option.key;
          const count = option.key === "bullish" ? bullish_count : option.key === "neutral" ? neutral_count : bearish_count;
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (option.key === current_user_vote) return;
                triggerFeedback();
                void on_vote(option.key);
              }}
              className={`inline-flex h-9 items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold transition duration-200 disabled:opacity-60 ${
                active
                  ? `scale-[1.02] shadow-sm ${option.activeTone}`
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
              }`}
            >
              <span>{option.label}</span>
              <span className={active ? "opacity-90" : "opacity-70"}>
                <AnimatedCount value={count} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <p className="text-[11px] font-medium text-slate-600">
          Community leaning {titleCaseStance(dominant_stance)} • <AnimatedCount value={total_votes} /> vote
          {total_votes === 1 ? "" : "s"}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="flex h-full w-full">
            <div className="h-full bg-emerald-300 transition-[width] duration-300" style={{ width: `${bullishPct}%` }} />
            <div className="h-full bg-slate-400 transition-[width] duration-300" style={{ width: `${neutralPct}%` }} />
            <div className="h-full bg-rose-300 transition-[width] duration-300" style={{ width: `${bearishPct}%` }} />
          </div>
        </div>
        <p className={`h-4 text-[11px] text-emerald-700 transition-opacity duration-200 ${showFeedback ? "opacity-100" : "opacity-0"}`}>
          Added to community pulse
        </p>
      </div>
    </section>
  );
}
