"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type { TrustFields } from "@/lib/trust/schema";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-slate-900">{children}</div>;
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) {
    return <div className="text-sm text-slate-500">Not specified.</div>;
  }
  return (
    <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2">
      {items.map((item) => (
        <li key={item} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

function ConfidencePill({ level }: { level: "low" | "medium" | "high" }) {
  const cls =
    level === "high"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : level === "low"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ring-1", cls)}>
      Confidence: {level}
    </span>
  );
}

export function FlipTrustFields({
  trust,
  onFlipBack,
  rightActionLabel = "Perspectives",
  onRightAction,
  showHeader = true,
  heroTitle = "Why you're seeing this",
  className,
}: {
  trust: TrustFields;
  onFlipBack?: () => void;
  rightActionLabel?: string;
  onRightAction?: () => void;
  showHeader?: boolean;
  heroTitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-full flex flex-col bg-white", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <button
            onClick={() => onFlipBack?.()}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            type="button"
          >
            ← Flip back
          </button>
          <button
            onClick={() => onRightAction?.()}
            className={cn(
              "text-sm font-semibold",
              onRightAction ? "text-slate-700 hover:text-slate-900" : "text-slate-500"
            )}
            type="button"
            disabled={!onRightAction}
          >
            {rightActionLabel}
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
          <div className="text-2xl font-bold text-slate-900">{heroTitle}</div>
          <SectionTitle>Facts (neutral)</SectionTitle>
          <BulletList items={trust.front.facts} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
            <SectionTitle>Short-term impact</SectionTitle>
            <BulletList items={trust.front.impact.shortTerm} />
            <SectionTitle>Long-term impact</SectionTitle>
            <BulletList items={trust.front.impact.longTerm} />
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
            <SectionTitle>Confidence</SectionTitle>
            <ConfidencePill level={trust.front.confidence.level} />
            <div className="text-sm text-slate-700">{trust.front.confidence.reason}</div>
            <SectionTitle>Audience reaction</SectionTitle>
            <BulletList items={trust.flip.audienceReaction} />
          </div>
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
          <SectionTitle>Framing cues</SectionTitle>
          <BulletList items={trust.flip.framing} />
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
          <SectionTitle>What might be missing</SectionTitle>
          <BulletList items={trust.flip.whatsMissing} />
        </div>
      </div>
    </div>
  );
}
