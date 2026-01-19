"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type VerifyStatus = "verified" | "unverified" | "disputed";

export interface VerifyClaim {
  claim: string;
  status: VerifyStatus;
  citations: string[];
}

function normalizeStatus(value: string | undefined | null): VerifyStatus {
  const lowered = value?.toLowerCase().trim();
  if (lowered === "verified") return "verified";
  if (lowered === "disputed" || lowered === "incorrect") return "disputed";
  return "unverified";
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function VerifyBubble({
  articleId,
  articleTitle,
  articleSummary,
  articleUrl,
  source,
  className,
  buttonClassName,
  bubbleClassName,
  inline = false,
  buttonLabel = "Verify claims",
  buttonHint = "Claims verified with DuckDuckGo",
  defaultOpen = false,
  onClaims,
}: {
  articleId: string;
  articleTitle: string;
  articleSummary: string;
  articleUrl: string;
  source: string;
  className?: string;
  buttonClassName?: string;
  bubbleClassName?: string;
  inline?: boolean;
  buttonLabel?: string;
  buttonHint?: string;
  defaultOpen?: boolean;
  onClaims?: (claims: VerifyClaim[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<VerifyClaim[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          articleTitle,
          articleSummary,
          articleUrl,
          source,
        }),
      });
      if (!res.ok) {
        throw new Error(`Verify failed (${res.status})`);
      }
      const data = await res.json();
      const rawClaims = Array.isArray(data?.claims) ? data.claims : [];
      const normalized = rawClaims.slice(0, 3).map((c: any) => {
        const citations = Array.isArray(c?.citations) ? c.citations.filter(Boolean).slice(0, 2) : [];
        const status = normalizeStatus(c?.status);
        return {
          claim: String(c?.claim ?? "").trim(),
          status: status === "disputed" ? "disputed" : citations.length ? "verified" : status,
          citations,
        } as VerifyClaim;
      });
      setClaims(normalized);
      onClaims?.(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "verify_failed");
    } finally {
      setLoading(false);
    }
  }, [articleId, articleTitle, articleSummary, articleUrl, source, onClaims]);

  useEffect(() => {
    if (!open) return;
    if (!claims && !loading && !error) {
      fetchClaims();
    }
  }, [open, claims, loading, error, fetchClaims]);

  useEffect(() => {
    if (!open) return;
    if (!claims?.length) return;
    setVisibleCount(0);
    let cancelled = false;
    const timeouts: number[] = [];
    for (let i = 1; i <= claims.length; i++) {
      timeouts.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setVisibleCount(i);
        }, 250 + (i - 1) * 350)
      );
    }
    return () => {
      cancelled = true;
      timeouts.forEach((t) => window.clearTimeout(t));
    };
  }, [open, claims]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (bubbleRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("touchstart", onPointerDown);
    window.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("wheel", onScroll, { capture: true });
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("wheel", onScroll, { capture: true });
    };
  }, [open]);

  const statusMeta = {
    verified: {
      label: "Verified",
      icon: "✓",
      chip: "bg-emerald-50 text-emerald-700",
      iconClass: "text-emerald-600 border-emerald-200 bg-emerald-50",
    },
    unverified: {
      label: "Unverified",
      icon: "•",
      chip: "bg-amber-50 text-amber-700",
      iconClass: "text-amber-700 border-amber-200 bg-amber-50",
    },
    disputed: {
      label: "Disputed",
      icon: "!",
      chip: "bg-rose-50 text-rose-700",
      iconClass: "text-rose-600 border-rose-200 bg-rose-50",
    },
  } as const;

  const visibleClaims = useMemo(() => {
    const list = claims ?? [];
    if (!list.length) return [];
    return list.slice(0, Math.max(0, visibleCount));
  }, [claims, visibleCount]);

  return (
    <div ref={wrapperRef} className={cn(inline ? "w-full" : "relative w-full", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50",
          buttonClassName
        )}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M10 2.5l5.5 2.2v4.5c0 4.1-2.8 7.8-5.5 9.1-2.7-1.3-5.5-5-5.5-9.1V4.7L10 2.5zm2.9 5.3l-3.5 4-1.8-1.7-1.1 1.2 2.9 2.6 4.6-5.2-1.1-.9z" />
          </svg>
        </span>
        <span className="flex flex-col items-start">
          <span>{buttonLabel}</span>
          <span className="text-xs font-medium text-slate-500">{buttonHint}</span>
        </span>
      </button>

      {open ? (
        <div
          ref={bubbleRef}
          className={cn(
            inline
              ? "mt-3 w-full rounded-2xl border border-slate-200 bg-white shadow-md"
              : "absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl border border-slate-200 bg-white shadow-xl",
            bubbleClassName
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="text-sm font-semibold text-slate-900">
              {loading ? (
                <>Verifying top claims…</>
              ) : (
                <>
                  Verification <span className="font-medium text-slate-500">(quick)</span>{" "}
                  <span className="text-slate-400">•</span>{" "}
                  <span className="font-medium text-slate-500">just now</span>
                </>
              )}
            </div>
            <button
              className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500 hover:text-slate-700"
              onClick={() => setOpen(false)}
              aria-label="Close verification"
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-3">
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" aria-hidden />
                Verifying claims…
              </div>
            ) : null}

            {!loading && error ? (
              <div className="space-y-3 text-sm text-slate-700">
                <div>Unable to verify claims right now</div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={fetchClaims}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {!loading && !error ? (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {visibleClaims.slice(0, 3).map((c, idx) => {
                  const meta = statusMeta[c.status];
                  return (
                    <div key={`${idx}:${c.claim}`} className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold",
                            meta.iconClass
                          )}
                          aria-hidden
                        >
                          {meta.icon}
                        </span>
                        <div className="text-sm font-semibold text-slate-900 line-clamp-1">{c.claim}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={cn("rounded-full px-2.5 py-1 font-semibold", meta.chip)}>{meta.label}</span>
                        {c.citations.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800"
                          >
                            {getDomain(url)}
                          </a>
                        ))}
                      </div>
                      {c.status === "unverified" ? (
                        <div className="text-xs text-slate-500">No reliable source found</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

        </div>
      ) : null}
    </div>
  );
}
