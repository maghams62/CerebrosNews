"use client";

import Image from "next/image";
import React, { useEffect } from "react";
import { BiasBadge } from "./BiasBadge";
import { StoryWithInsights } from "@/types/storyWithInsights";

interface Props {
  item: StoryWithInsights | null;
  onClose: () => void;
}

export function ArticleModal({ item, onClose }: Props) {
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [item, onClose]);

  if (!item) return null;

  const { story, insights } = item;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-[min(900px,90vw)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <button
          className="absolute right-3 top-3 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-slate-700 shadow"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flex flex-col">
          <div className="relative h-56 w-full overflow-hidden rounded-t-2xl">
            <Image
              src={story.imageUrl}
              alt={story.title}
              fill
              sizes="100vw"
              className="object-cover"
              priority={false}
              unoptimized={story.imageUrl.endsWith(".svg")}
            />
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BiasBadge label={insights.biasLabel} />
              <span className="font-semibold text-slate-700">{story.sourceName}</span>
              <span className="text-slate-400">•</span>
              <span>{story.publishedAt}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{story.title}</h2>
            <p className="text-slate-700 leading-relaxed">{story.fullText}</p>
            {insights.sources.length ? (
              <div className="pt-2">
                <h4 className="text-sm font-semibold text-slate-800">Other coverage</h4>
                <div className="mt-1 flex flex-wrap gap-2">
                  {insights.sources.map((s) => (
                    <span key={s.url} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
