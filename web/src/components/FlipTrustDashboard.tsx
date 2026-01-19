"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type { TrustDashboard } from "@/types/insights";

function timeAgoLabel(mins: number) {
  if (mins <= 0) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return `${h}h ago`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function BarRow({ label, value, helper }: { label: string; value: number; helper?: string }) {
  const pct = clampPercent(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs font-semibold text-slate-500">{pct}%</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {helper ? <div className="text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function SpectrumRow({ left, right, value }: { left: string; right: string; value: number }) {
  const pct = clampPercent(value);
  return (
    <div className="space-y-2">
      <div className="relative flex-1 h-2 rounded-full bg-slate-200">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-slate-900 shadow"
          style={{ left: `calc(${pct}% - 8px)` }}
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function SentimentRow({ value }: { value: number }) {
  const pct = clampPercent(value);
  return (
    <div className="space-y-2">
      <div className="relative flex-1 h-2 rounded-full overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, #65a30d 0%, #22c55e 45%, #f59e0b 65%, #fbbf24 100%)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-slate-900 shadow"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Skeptical</span>
        <span>Optimistic</span>
      </div>
    </div>
  );
}

function CoveragePill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "neutral" | "positive";
}) {
  const cls =
    tone === "critical"
      ? "bg-rose-100 text-rose-900 ring-rose-200"
      : tone === "positive"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1", cls)}>
      <span>{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </span>
  );
}

function ConfidencePill({ level }: { level: "High" | "Medium" | "Low" }) {
  const cls =
    level === "High"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : level === "Low"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-amber-50 text-amber-900 ring-amber-200";

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ring-1", cls)}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      Confidence: {level}
    </span>
  );
}

function UpdatedPill({ mins }: { mins: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
      <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
      <span>Fresh &amp; evolving</span>
      <span className="text-slate-500 font-semibold">Updated {timeAgoLabel(mins)}</span>
    </span>
  );
}

function SkeletonBar() {
  return <div className="h-3 w-full rounded-full bg-slate-200 animate-pulse" />;
}

function SkeletonSection({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <SkeletonBar />
      <SkeletonBar />
    </div>
  );
}

export function FlipTrustDashboard({
  dashboard,
  storyTitle,
  storyTags,
  onFlipBack,
  backLabel = "← Flip back",
  rightActionLabel = "Perspectives",
  onRightAction,
  loading = false,
  fallbackReason,
}: {
  dashboard: TrustDashboard;
  storyTitle?: string;
  storyTags?: string[];
  onFlipBack: () => void;
  backLabel?: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  loading?: boolean;
  fallbackReason?: string | null;
}) {
  const minsRaw = dashboard?.provenance?.updatedMinsAgo;
  const mins = Number.isFinite(minsRaw) ? (minsRaw as number) : 0;
  const tags = (storyTags ?? []).filter(Boolean).slice(0, 8);

  const showFallback = Boolean(!loading && fallbackReason);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-700">Loading trust signals…</span>
          <button
            onClick={onFlipBack}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            type="button"
          >
            Back
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-6 space-y-4">
          <SkeletonSection title="Why you're seeing this" />
          <SkeletonSection title="Framing & sentiment" />
          <SkeletonSection title="Coverage mix" />
        </div>
      </div>
    );
  }

  if (showFallback) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <button
            onClick={onFlipBack}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            type="button"
          >
            {backLabel}
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

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-4">
            <div className="text-2xl font-bold text-slate-900">Why you&apos;re seeing this</div>
            <div className="text-sm text-slate-700">
              This story is surfaced because it aligns with your interests and the sources you follow.
            </div>
            {tags.length ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="text-slate-500">Because you like:</span>
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="pt-1 space-y-3">
              <BarRow label="Relevance to AI & Tech" value={dashboard.selection.relevance} />
              <BarRow label="Trending across sources" value={dashboard.selection.trending} />
              <BarRow label="Potential impact" value={dashboard.selection.informationGain} />
            </div>
            {fallbackReason ? <div className="text-xs text-slate-500">{fallbackReason}</div> : null}
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-3">
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <ConfidencePill level={dashboard.confidence.level} />
              <UpdatedPill mins={mins} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top bar like reference */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <button
          onClick={onFlipBack}
          className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          type="button"
        >
          {backLabel}
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

      <div className="flex-1 min-h-0 overflow-hidden p-6 space-y-4">
        <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-4">
          <div className="text-2xl font-bold text-slate-900">Why you&apos;re seeing this</div>
          <div className="text-sm text-slate-700">
            This story is surfaced because it matches your interests and reading patterns.
          </div>
          {storyTitle ? <div className="text-sm font-semibold text-slate-900">{storyTitle}</div> : null}
          {tags.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="text-slate-500">Because you like:</span>
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="pt-1 space-y-3">
            <BarRow label="Relevance to AI & Tech" value={dashboard.selection.relevance} />
            <BarRow label="Trending across sources" value={dashboard.selection.trending} />
            <BarRow label="Potential impact" value={dashboard.selection.informationGain} />
          </div>
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Framing spectrum</div>
              <div className="text-xs text-slate-500">Balance of perspectives</div>
            </div>
            <SpectrumRow left="Left" right="Right" value={dashboard.framing.political} />
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Sentiment</div>
            <SentimentRow value={dashboard.framing.techSentiment} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">Coverage mix</div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
              <CoveragePill label="Critical" tone="critical" value={dashboard.coverage.mix.media} />
              <CoveragePill label="Neutral" tone="neutral" value={dashboard.coverage.mix.community} />
              <CoveragePill label="Positive" tone="positive" value={dashboard.coverage.mix.official} />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <ConfidencePill level={dashboard.confidence.level} />
            <UpdatedPill mins={mins} />
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Analyzed {dashboard.coverage.independentSourceCount || dashboard.provenance.computedFromSources} independent sources •
          updated {dashboard.provenance.updatedMinsAgo}m ago
          <br />
          Models: Clustering {dashboard.provenance.models.clustering} • Bias {dashboard.provenance.models.framing} • Coverage{" "}
          {dashboard.provenance.models.coverage}
        </div>
      </div>
    </div>
  );
}

