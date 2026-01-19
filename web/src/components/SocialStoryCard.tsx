"use client";

import React from "react";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { cn } from "@/lib/cn";
import { filterHighSignalTags } from "@/lib/tags/highSignal";

export function SocialStoryCard({
  item,
  onOpenLink,
  onOpenPost,
}: {
  item: StoryWithInsights;
  onOpenLink?: () => void;
  onOpenPost?: () => void;
}) {
  const { story } = item;
  const linkUrl = story.url && story.url !== story.postUrl ? story.url : null;
  const postUrl = story.postUrl ?? story.url ?? null;
  const metrics = story.metrics ?? {};
  const tags = filterHighSignalTags(story.tags ?? [], { max: 6 });

  return (
    <div className="h-full w-full">
      <div className="relative h-full w-full rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <div className="flex h-full flex-col p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Social</span>
              <span className="text-xs text-slate-500">Bluesky</span>
            </div>
            <div className="text-xs text-slate-500">{story.publishedAt}</div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-900">
              {story.author ?? "Bluesky user"}
              {story.authorHandle ? <span className="text-slate-500"> · @{story.authorHandle}</span> : null}
            </div>
            <div className="mt-3 text-base text-slate-700 leading-relaxed line-clamp-6">
              {story.fullText || story.summary}
            </div>
          </div>

          {tags.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.slice(0, 6).map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className={cn("rounded-full px-2.5 py-1", metrics.likes ? "bg-emerald-50 text-emerald-700" : "bg-slate-100")}>
              ♥ {metrics.likes ?? 0}
            </span>
            <span className={cn("rounded-full px-2.5 py-1", metrics.reposts ? "bg-indigo-50 text-indigo-700" : "bg-slate-100")}>
              ↻ {metrics.reposts ?? 0}
            </span>
            <span className={cn("rounded-full px-2.5 py-1", metrics.replies ? "bg-amber-50 text-amber-700" : "bg-slate-100")}>
              💬 {metrics.replies ?? 0}
            </span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
            {linkUrl ? (
              <button
                type="button"
                className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                onClick={onOpenLink}
              >
                Open link ↗
              </button>
            ) : null}
            {postUrl ? (
              <button
                type="button"
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold",
                  linkUrl ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
                onClick={onOpenPost}
              >
                Open post ↗
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
