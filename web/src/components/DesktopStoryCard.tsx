"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { VerifyBubble, type VerifyClaim } from "@/components/VerifyBubble";
import { sanitizeSummaryBullets } from "@/lib/summaries/sanitize";
import { loadTrustFields, type TrustFieldIndex } from "@/lib/trust/loadTrustFields";
import { filterHighSignalTags } from "@/lib/tags/highSignal";

function extractBullets(markdown: string | undefined | null): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

export function DesktopStoryCard({
  item,
  perspectiveIndex = 0,
  onOpenArticle,
  onOpenVariant: _onOpenVariant,
  bookmarked = false,
  onToggleBookmark,
  onOpenSources: _onOpenSources,
  onOpenPerspectives,
  onOpenAsk,
  onOpenTrust,
}: {
  item: StoryWithInsights;
  perspectiveIndex?: number;
  onOpenArticle: () => void;
  onOpenVariant?: (id: string) => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onOpenSources?: () => void;
  onOpenPerspectives?: () => void;
  onOpenAsk?: () => void;
  onOpenTrust?: () => void;
}) {
  const { story, insights } = item;
  const perspective =
    story.perspectives[Math.min(perspectiveIndex, Math.max(0, story.perspectives.length - 1))] ?? null;
  const showFlipDebug = process.env.NEXT_PUBLIC_DEBUG_FLIP === "1";
  const [activeTab, setActiveTab] = useState<"summary" | "framing" | "missing" | "soWhat">("summary");
  const [verifyClaims, setVerifyClaims] = useState<VerifyClaim[] | null>(null);
  const [imgSrc, setImgSrc] = useState<string>(story.imageUrl);
  const [trustIndex, setTrustIndex] = useState<TrustFieldIndex | null>(null);

  useEffect(() => {
    let active = true;
    loadTrustFields()
      .then((idx) => {
        if (!active) return;
        setTrustIndex(idx);
      })
      .catch(() => {
        if (!active) return;
        setTrustIndex({});
      });
    return () => {
      active = false;
    };
  }, []);

  const trustFields = useMemo(() => {
    const articleId = perspective?.id ?? null;
    const fromIndex = articleId ? trustIndex?.[articleId]?.trust : undefined;
    const fallback: import("@/lib/trust/schema").TrustFields = {
      whats_missing: ["Missing details and stakeholders until enrichment runs."],
      so_what: {
        near_term: ["Implications not yet assessed."],
        long_term: ["Long-term effects not yet assessed."],
      },
      framing: {
        lens: "opinion/analysis",
        emphasis: ["Focuses on headline claims."],
        downplays: ["Tradeoffs and limitations not covered."],
        language_notes: ["Neutral tone."],
      },
    };
    return fromIndex ?? insights.trustFields ?? fallback;
  }, [insights.trustFields, perspective?.id, perspective?.title, story.title, trustIndex]);

  const bestImageSrc = useMemo(() => {
    const s = story.imageUrl;
    const placeholder = (u?: string | null) => !u || u.includes("placeholder.svg") || u.includes("/globe.svg");
    if (!placeholder(s)) return s;
    return s || "/globe.svg";
  }, [story.imageUrl]);

  const displayTags = useMemo(() => filterHighSignalTags(story.tags ?? [], { max: 6 }), [story.tags]);

  React.useEffect(() => {
    setImgSrc(bestImageSrc);
  }, [bestImageSrc]);

  const summaryBullets = useMemo(() => {
    const domain = (() => {
      try {
        return story.url ? new URL(story.url).hostname : null;
      } catch {
        return null;
      }
    })();

    // Prefer the already-generated markdown bullets from the dataset (no fallback to title),
    // so we always render the multi-bullet summaries the pipeline produced.
    const directBullets = extractBullets(story.analysis?.summary_markdown ?? "");
    if (directBullets.length >= 2) return directBullets.slice(0, 6);

    // If the current perspective already has a good summary, use it.
    const perspectiveBullets = extractBullets(perspective?.summary ?? "");
    if (perspectiveBullets.length >= 2) return perspectiveBullets.slice(0, 6);

    // Otherwise, fall back to the sanitized inference (which may use title).
    return sanitizeSummaryBullets({
      title: perspective?.title ?? story.title,
      markdown: story.analysis?.summary_markdown ?? story.summary,
      sourceName: perspective?.sourceName ?? story.sourceName,
      domain,
      publishedAt: story.publishedAt,
      tags: story.tags ?? [],
      minBullets: 2,
    }).slice(0, 5);
  }, [
    perspective?.sourceName,
    perspective?.title,
    story.analysis?.summary_markdown,
    story.publishedAt,
    story.sourceName,
    story.summary,
    story.tags,
    story.title,
    story.url,
  ]);

  function renderTextBlock(text?: string) {
    if (!text) return <div className="text-sm text-slate-500">Not specified.</div>;
    return <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</div>;
  }

  function renderBulletsOrFallback(bullets: string[], fallbackBullets: string[]) {
    const list = bullets.length ? bullets : fallbackBullets;
    const cleaned = list.map((b) => b.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
    if (!cleaned.length) return renderTextBlock(undefined);
    return (
      <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2">
        {cleaned.map((b, idx) => (
          <li key={`${b}-${idx}`} className="leading-relaxed">
            {b}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="h-full w-full">
      <div className="relative h-full w-full rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="grid h-full grid-cols-12">
          {/* Left column (image + verify) */}
          <div className="col-span-5 border-r border-slate-200 flex flex-col min-h-0">
            <div className="relative w-full h-[240px] overflow-hidden">
              <div className="absolute inset-0 overflow-hidden rounded-tl-3xl">
                <button
                  type="button"
                  className="absolute inset-0"
                  onClick={() => onOpenTrust?.()}
                  aria-label="Why am I seeing this"
                >
                  <Image
                    src={imgSrc}
                    alt={perspective?.title ?? story.title}
                    fill
                    sizes="(min-width: 1024px) 40vw, 100vw"
                    className="object-cover"
                    priority={false}
                    unoptimized={imgSrc.endsWith(".svg")}
                    onError={() => setImgSrc("/globe.svg")}
                  />
                </button>
              </div>
            </div>
            <div className="w-full border-b border-slate-200 px-4 py-4">
              <VerifyBubble
                articleId={story.id}
                articleTitle={story.title}
                articleSummary={story.summary}
                articleUrl={story.url}
                source={story.sourceName}
                inline
                buttonClassName="w-full justify-start"
                onClaims={(claims) => setVerifyClaims(claims)}
              />
            </div>
            <div className="w-full border-b border-slate-200 px-4 py-4">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800",
                  "hover:border-indigo-200 hover:bg-indigo-50/60"
                )}
                onClick={() => onOpenAsk?.()}
                aria-label="Aks Cerebros about this article"
              >
                <span aria-hidden>💬</span>
                <span>Aks Cerebros about this article</span>
              </button>
            </div>
            <div className="flex-1 min-h-0" />
          </div>

          {/* Right column (consumption mode) */}
          <div className="col-span-7 flex flex-col min-h-0 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{perspective?.sourceName ?? story.sourceName}</span>{" "}
                <span className="text-slate-400">•</span> {story.publishedAt}
              </div>
              {insights.trustDashboard.vestedInterestHint ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  Possible vested interest detected
                </span>
              ) : null}
            </div>

            <h2 className="mt-4 text-3xl font-bold text-slate-900 leading-tight line-clamp-2">
              {perspective?.title ?? story.title}
            </h2>

            {displayTags.length || (verifyClaims ?? []).length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {displayTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-4" data-feed-scroll-area="summary">
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="grid grid-cols-4 rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                    {[
                      { key: "summary", label: "Summary" },
                      { key: "framing", label: "Framing" },
                      { key: "missing", label: "What’s Missing" },
                      { key: "soWhat", label: "Impact" },
                    ].map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key as typeof activeTab)}
                        className={cn(
                          "rounded-full px-3 py-1.5 transition-colors text-center",
                          activeTab === t.key ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-4">
                  {activeTab === "summary"
                    ? renderBulletsOrFallback(
                        (() => {
                          const perspectiveBullets = extractBullets(perspective?.summary ?? "");
                          if (perspectiveBullets.length >= 2) return perspectiveBullets.slice(0, 5);
                          return extractBullets(story.analysis?.summary_markdown ?? story.summary ?? "").slice(0, 5);
                        })(),
                        ["Summary not yet available."]
                      )
                    : activeTab === "framing"
                      ? (
                        <div className="space-y-3 text-sm text-slate-700">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Lens</div>
                          <div className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-800 inline-flex">
                            {trustFields.framing.lens}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-500">What it emphasizes</div>
                            {renderBulletsOrFallback(trustFields.framing.emphasis, [
                              "Highlights headline claims.",
                              "Little detail on tradeoffs.",
                            ])}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-500">What it downplays</div>
                            {renderBulletsOrFallback(trustFields.framing.downplays, ["Glosses over limitations."])}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-500">Language notes</div>
                            {renderBulletsOrFallback(trustFields.framing.language_notes, ["Tone not specified."])}
                          </div>
                        </div>
                        )
                      : activeTab === "missing"
                        ? renderBulletsOrFallback(trustFields.whats_missing, [
                            "Missing signals not available yet.",
                            "Run trust field enrichment to populate this.",
                          ])
                        : (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-500">Near term (weeks–months)</div>
                              {renderBulletsOrFallback(trustFields.so_what.near_term, [
                                "Near-term implications not yet assessed.",
                              ])}
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-500">Long term (months–years)</div>
                              {renderBulletsOrFallback(trustFields.so_what.long_term, [
                                "Long-term implications not yet assessed.",
                              ])}
                            </div>
                          </div>
                        )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Sources</div>
                  {story.url ? (
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Read full →
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {story.perspectives.map((p) => (
                    <a
                      key={p.id}
                      href={p.url ?? story.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-slate-200 p-3 hover:border-indigo-200 hover:bg-indigo-50/60 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 line-clamp-2">{p.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {p.sourceName} {p.publishedAt ? `• ${p.publishedAt}` : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-3">
                  <button className="hover:text-slate-900" onClick={() => onOpenPerspectives?.()} type="button">
                    Compare
                  </button>
                  <button className="hover:text-slate-900" onClick={() => onOpenTrust?.()} type="button">
                    Why am I seeing this
                  </button>
                  <button
                    className={cn("hover:text-slate-900", bookmarked ? "text-indigo-700" : "")}
                    onClick={() => onToggleBookmark?.()}
                    type="button"
                  >
                    {bookmarked ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showFlipDebug ? (
          <div className="absolute inset-x-3 top-3 z-20 rounded-lg bg-black/70 px-3 py-2 text-[11px] text-white space-y-1">
            <div>story: {story.id}</div>
            <div>perspective: {perspective?.id ?? "none"}</div>
            <div>hasDashboard: {Boolean(insights?.trustDashboard).toString()}</div>
            <div>hasTrustFields: {Boolean(insights?.trustFields).toString()}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

