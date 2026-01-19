"use client";

import React, { useEffect, useRef, useState } from "react";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { FlipTrustDashboard } from "@/components/FlipTrustDashboard";
import { normalizeTrustDashboard } from "@/lib/trust/normalizeDashboard";
import type { TrustDashboard } from "@/types/insights";

const trustDashboardCache = new Map<string, TrustDashboard>();

export function TrustPanel({
  item,
  open,
  onClose,
  onOpenPerspectives,
}: {
  item: StoryWithInsights | null;
  open: boolean;
  onClose: () => void;
  onOpenPerspectives?: () => void;
}) {
  const [remoteDashboard, setRemoteDashboard] = useState<TrustDashboard | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const currentRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !item) return;
    const cacheKey = item.story.id;
    const cached = trustDashboardCache.get(cacheKey);
    if (cached) {
      setRemoteDashboard(cached);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    if (currentRequestRef.current === cacheKey) return;
    currentRequestRef.current = cacheKey;
    setRemoteLoading(true);
    setRemoteError(null);

    const controller = new AbortController();
    const payload = {
      storyId: item.story.id,
      title: item.story.title,
      summary: item.story.summary ?? item.story.analysis?.summary_markdown ?? "",
      publishedAt: item.story.publishedAt,
      tags: item.story.tags ?? [],
      sources: item.story.perspectives.map((p) => ({
        title: p.title,
        sourceName: p.sourceName,
        publishedAt: p.publishedAt,
        url: p.url,
      })),
    };

    fetch("/api/trust-dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "trust_failed");
        }
        return res.json();
      })
      .then((data) => {
        const dash = data?.dashboard as TrustDashboard | undefined;
        if (dash) {
          trustDashboardCache.set(cacheKey, dash);
          setRemoteDashboard(dash);
        } else {
          throw new Error("trust_failed");
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setRemoteError("Unable to fetch live trust signals; showing demo defaults.");
      })
      .finally(() => {
        setRemoteLoading(false);
      });

    return () => controller.abort();
  }, [open, item]);

  if (!open || !item) return null;

  const baseDashboard = item.insights?.trustDashboard ?? null;
  const mergedDashboard = remoteDashboard ?? baseDashboard;
  const { dashboard, fallbackReason } = normalizeTrustDashboard(mergedDashboard);
  const loading = remoteLoading;
  const effectiveFallback = remoteError ?? fallbackReason;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3">
      <div className="w-full max-w-[430px] md:max-w-[min(900px,75vw)] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <FlipTrustDashboard
          dashboard={dashboard}
        storyTitle={item.story.title}
        storyTags={item.story.tags ?? []}
          loading={loading}
          fallbackReason={effectiveFallback}
          onFlipBack={onClose}
          backLabel="← Close"
          rightActionLabel="Perspectives"
          onRightAction={onOpenPerspectives}
        />
      </div>
    </div>
  );
}
