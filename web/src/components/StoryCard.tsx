"use client";

import Image from "next/image";
import React, { useState } from "react";
import { ActionRow } from "./ActionRow";
import { VerifyBubble, type VerifyClaim } from "./VerifyBubble";
import { StoryWithInsights } from "@/types/storyWithInsights";

interface Props {
  item: StoryWithInsights;
  perspectiveIndex?: number;
  onReadFull: (item: StoryWithInsights) => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onOpenSources?: () => void;
  onOpenPerspectives?: () => void;
  onOpenAsk?: () => void;
  onOpenTrust?: () => void;
}

export function StoryCard({
  item,
  perspectiveIndex = 0,
  onReadFull,
  bookmarked = false,
  onToggleBookmark,
  onOpenSources,
  onOpenPerspectives,
  onOpenAsk,
  onOpenTrust,
}: Props) {
  const { story, insights } = item;
  const perspective = story.perspectives[Math.min(perspectiveIndex, Math.max(0, story.perspectives.length - 1))] ?? null;
  const [verifyClaims, setVerifyClaims] = useState<VerifyClaim[] | null>(null);

  return (
    <div className="h-full">
      <div className="relative h-full w-full rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="relative h-64 w-full overflow-hidden">
          <div className="absolute inset-0 overflow-hidden rounded-t-3xl">
            <button
              className="absolute inset-0"
              onClick={() => onOpenTrust?.()}
              aria-label="Why am I seeing this"
            >
              <Image
                src={story.imageUrl}
                alt={perspective?.title ?? story.title}
                fill
                sizes="100vw"
                className="object-cover"
                priority={false}
                unoptimized={story.imageUrl.endsWith(".svg")}
              />
            </button>
          </div>
        </div>
        <div className="w-full border-b border-slate-200 px-5 py-4">
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
        <div className="flex flex-1 min-h-0 flex-col gap-3 px-5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{perspective?.sourceName ?? story.sourceName}</span>
              <span className="text-slate-400">•</span>
              <span>{story.publishedAt}</span>
            </div>
            {insights.trustDashboard.vestedInterestHint ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Possible vested interest detected
              </span>
            ) : null}
          </div>

          <h2 className="text-3xl font-bold text-slate-900 leading-tight line-clamp-2">
            {perspective?.title ?? story.title}
          </h2>
          {(verifyClaims ?? [])
            .filter((c) => c.status === "verified")
            .slice(0, 3).length ? (
            <div className="-mt-1 flex flex-wrap gap-2">
              {(verifyClaims ?? [])
                .filter((c) => c.status === "verified")
                .slice(0, 3)
                .map((c) => (
                  <span
                    key={`vc:${c.claim}`}
                    className="max-w-[260px] rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 line-clamp-1"
                    title={c.claim}
                  >
                    ✓ {c.claim}
                  </span>
                ))}
            </div>
          ) : null}
          <div className="mt-auto space-y-3">
            <button
              className="w-full rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
              onClick={() => onReadFull(item)}
            >
              Read Full
            </button>
            <ActionRow
              onPerspectives={() => onOpenPerspectives?.()}
              onTrust={() => onOpenTrust?.()}
              onAsk={() => onOpenAsk?.()}
              onSave={() => onToggleBookmark?.()}
              saved={bookmarked}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
