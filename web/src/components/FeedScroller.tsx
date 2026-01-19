"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { StoryWithInsights } from "@/types/storyWithInsights";
import { useRouter } from "next/navigation";
import { DesktopStoryCard } from "@/components/DesktopStoryCard";
import { SocialStoryCard } from "@/components/SocialStoryCard";
import { FeedDots } from "./FeedDots";
import { SourcesPanel } from "./SourcesPanel";
import { PerspectivesPanel } from "./PerspectivesPanel";
import { TrustPanel } from "./TrustPanel";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface Props {
  stories: StoryWithInsights[];
}

export function FeedScroller({ stories }: Props) {
  const router = useRouter();
  const [storyIndex, setStoryIndex] = useState(0);
  const [perspectiveIndex, setPerspectiveIndex] = useState(0);
  const [directionY, setDirectionY] = useState<1 | -1>(1);
  const [directionX, setDirectionX] = useState<1 | -1>(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set());
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesItem, setSourcesItem] = useState<StoryWithInsights | null>(null);
  const [perspectivesOpen, setPerspectivesOpen] = useState(false);
  const [perspectivesItem, setPerspectivesItem] = useState<StoryWithInsights | null>(null);
  const [trustOpen, setTrustOpen] = useState(false);
  const [trustItem, setTrustItem] = useState<StoryWithInsights | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastChatStoryIdRef = useRef<string | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelLastRef = useRef(0);
  const pointerRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, pointerId: null });

  const currentItem = useMemo(
    () => stories[Math.min(storyIndex, Math.max(0, stories.length - 1))] ?? null,
    [stories, storyIndex]
  );

  const currentPerspectiveCount = currentItem?.story.perspectives.length ?? 0;
  const isSocial = currentItem?.story.sourceType === "social";
  const anyOverlayOpen =
    sourcesOpen ||
    perspectivesOpen ||
    trustOpen ||
    chatOpen ||
    helpOpen;

  const lockFor = useCallback((ms = 280) => {
    setIsAnimating(true);
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => setIsAnimating(false), ms);
  }, []);

  const goToStory = useCallback((next: number) => {
    if (anyOverlayOpen || isAnimating) return;
    const clamped = Math.max(0, Math.min(stories.length - 1, next));
    if (clamped === storyIndex) return;
    setDirectionY(clamped > storyIndex ? 1 : -1);
    setStoryIndex(clamped);
    setPerspectiveIndex(0);
    setChatOpen(false);
    setPerspectivesOpen(false);
    setTrustOpen(false);
    lockFor(300);
  }, [anyOverlayOpen, isAnimating, lockFor, stories.length, storyIndex]);

  const goToPerspective = useCallback((next: number) => {
    if (anyOverlayOpen || isAnimating) return;
    if (!currentItem) return;
    const count = currentItem.story.perspectives.length;
    const clamped = Math.max(0, Math.min(count - 1, next));
    if (clamped === perspectiveIndex) return;
    setDirectionX(clamped > perspectiveIndex ? 1 : -1);
    setPerspectiveIndex(clamped);
    setTrustOpen(false);
    lockFor(260);
  }, [anyOverlayOpen, currentItem, isAnimating, lockFor, perspectiveIndex]);

  function openSourcesFor(item: StoryWithInsights) {
    setSourcesItem(item);
    setSourcesOpen(true);
  }

  function openTrustFor(item: StoryWithInsights) {
    setTrustItem(item);
    setTrustOpen(true);
  }

  function closeAllOverlays() {
    setSourcesOpen(false);
    setSourcesItem(null);
    setPerspectivesOpen(false);
    setPerspectivesItem(null);
    setTrustOpen(false);
    setTrustItem(null);
    setChatOpen(false);
    setHelpOpen(false);
  }

  const sendChat = useCallback(async () => {
    if (!currentItem || chatLoading) return;
    const text = chatInput.trim();
    if (!text) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: currentItem.story.id,
          title: currentItem.story.title,
          summary: currentItem.story.summary,
          fullText: currentItem.story.fullText,
          analysisSummary: currentItem.story.analysis?.summary_markdown ?? "",
          messages: nextMessages.slice(-8),
        }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Request failed");
      }

      const data = await res.json();
      const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("Empty reply");
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatError("Sorry, I couldn't answer that right now.");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, currentItem]);

  useEffect(() => {
    const id = window.setTimeout(() => setHintVisible(false), 2000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!chatOpen || !currentItem) return;
    const storyId = currentItem.story.id;
    if (lastChatStoryIdRef.current !== storyId) {
      lastChatStoryIdRef.current = storyId;
      setChatMessages([
        {
          role: "assistant",
          content: `You're chatting with "${currentItem.story.title}". Aks Cerebros about this article.`,
        },
      ]);
      setChatInput("");
      setChatError(null);
      setChatLoading(false);
    }
  }, [chatOpen, currentItem]);

  useEffect(() => {
    if (!chatOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatOpen, chatMessages, chatLoading]);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    };
  }, []);

  // Wheel / trackpad: snap by story, no page scroll / inner scroll feel.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (anyOverlayOpen || isAnimating) return;
      const target = e.target as HTMLElement | null;
      const scrollArea = target?.closest?.('[data-feed-scroll-area="summary"]') as HTMLElement | null;
      if (scrollArea) {
        const { scrollTop, scrollHeight, clientHeight } = scrollArea;
        const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
        const canScrollUp = scrollTop > 0;
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          wheelAccumRef.current = 0;
          return;
        }
      }
      e.preventDefault();

      const now = performance.now();
      if (now - wheelLastRef.current > 450) wheelAccumRef.current = 0;
      wheelLastRef.current = now;

      wheelAccumRef.current += e.deltaY;
      if (Math.abs(wheelAccumRef.current) < 60) return;

      const dir = wheelAccumRef.current > 0 ? 1 : -1;
      wheelAccumRef.current = 0;
      goToStory(storyIndex + dir);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, [anyOverlayOpen, goToStory, isAnimating, storyIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.key === "Escape") {
        closeAllOverlays();
        return;
      }

      // If a panel/modal is open, don't let navigation keys change the underlying view.
      if (anyOverlayOpen) return;

      if (!currentItem) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (currentItem.story.sourceType === "social") {
          const url = currentItem.story.url;
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        } else {
          openCurrentArticle();
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        goToStory(storyIndex + 1);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        goToStory(storyIndex - 1);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        goToPerspective(perspectiveIndex + 1);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        goToPerspective(perspectiveIndex - 1);
        return;
      }

      if (e.key === "b") {
        e.preventDefault();
        setBookmarks((prev) => {
          const next = new Set(prev);
          const id = currentItem.story.id;
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }
      if (e.key === "r") {
        e.preventDefault();
        if (currentItem.story.sourceType === "social") {
          const url = currentItem.story.url;
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        } else {
          openCurrentArticle();
        }
        return;
      }

      if (e.key === "y") {
        e.preventDefault();
        if (currentItem.story.sourceType === "social") return;
        openTrustFor(currentItem);
        return;
      }

      if (e.key === "c") {
        e.preventDefault();
        setChatOpen(true);
        return;
      }

      if (e.key === "p") {
        e.preventDefault();
        if (currentItem.story.sourceType === "social") return;
        setPerspectivesItem(currentItem);
        setPerspectivesOpen(true);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [anyOverlayOpen, currentItem, goToPerspective, goToStory, perspectiveIndex, router, storyIndex]);

  function openExternal(url?: string | null) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openCurrentArticle() {
    if (!currentItem) return;
    const variantId = currentItem.story.perspectives[perspectiveIndex]?.id ?? currentItem.story.id;
    router.push(`/article/${variantId}`);
  }

  const EASE = [0.22, 1, 0.36, 1] as const;

  const storyVariants = {
    enter: (dir: 1 | -1) => ({
      y: dir > 0 ? 90 : -90,
      opacity: 0,
    }),
    center: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: EASE },
    },
    exit: (dir: 1 | -1) => ({
      y: dir > 0 ? -90 : 90,
      opacity: 0,
      transition: { duration: 0.24, ease: EASE },
    }),
  } as const;

  const perspectiveVariants = {
    enter: (dir: 1 | -1) => ({
      x: dir > 0 ? 70 : -70,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.24, ease: EASE },
    },
    exit: (dir: 1 | -1) => ({
      x: dir > 0 ? -70 : 70,
      opacity: 0,
      transition: { duration: 0.2, ease: EASE },
    }),
  } as const;

  return (
    <>
      <div
        ref={deckRef}
        className={cn("relative h-full w-full overflow-hidden touch-none select-none", anyOverlayOpen ? "" : "cursor-default")}
        onPointerDown={(e) => {
          if (anyOverlayOpen || isAnimating) return;
          const target = e.target as HTMLElement | null;
          // If the user is clicking/tapping an interactive element inside a card,
          // don't grab pointer capture or treat it as a swipe.
          if (target?.closest?.("button,a,input,textarea,select,[role='button']")) return;
          pointerRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
          };
          (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          pointerRef.current.active = false;
        }}
        onPointerUp={(e) => {
          const p = pointerRef.current;
          if (!p.active) return;
          pointerRef.current.active = false;
          (e.currentTarget as HTMLDivElement).releasePointerCapture?.(p.pointerId ?? e.pointerId);
          if (anyOverlayOpen || isAnimating) return;

          const dx = e.clientX - p.startX;
          const dy = e.clientY - p.startY;
          if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;

          if (Math.abs(dy) >= Math.abs(dx)) {
            goToStory(storyIndex + (dy < 0 ? 1 : -1));
          } else {
            goToPerspective(perspectiveIndex + (dx < 0 ? 1 : -1));
          }
        }}
      >
        <div className="relative h-full w-full overflow-hidden">
          <AnimatePresence initial={false} custom={directionY}>
            <motion.div
              key={currentItem?.story.id ?? `empty:${storyIndex}`}
              custom={directionY}
              variants={storyVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              {currentItem ? (
                <div className="h-full px-6 py-6">
                  <div className="relative h-full w-full overflow-hidden">
                    <AnimatePresence initial={false} custom={directionX}>
                      <motion.div
                        key={
                          isSocial ? currentItem.story.id : currentItem.story.perspectives[perspectiveIndex]?.id ?? `p:${perspectiveIndex}`
                        }
                        custom={directionX}
                        variants={perspectiveVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="absolute inset-0"
                      >
                        {isSocial ? (
                          <SocialStoryCard
                            item={currentItem}
                            onOpenLink={() => openExternal(currentItem.story.url)}
                            onOpenPost={() => openExternal(currentItem.story.postUrl ?? currentItem.story.url)}
                          />
                        ) : (
                          <DesktopStoryCard
                            item={currentItem}
                            perspectiveIndex={perspectiveIndex}
                            bookmarked={bookmarks.has(currentItem.story.id)}
                            onToggleBookmark={() =>
                              setBookmarks((prev) => {
                                const next = new Set(prev);
                                if (next.has(currentItem.story.id)) next.delete(currentItem.story.id);
                                else next.add(currentItem.story.id);
                                return next;
                              })
                            }
                            onOpenArticle={openCurrentArticle}
                            onOpenVariant={(variantId) => router.push(`/article/${variantId}`)}
                            onOpenSources={() => openSourcesFor(currentItem)}
                            onOpenPerspectives={() => {
                              setPerspectivesItem(currentItem);
                              setPerspectivesOpen(true);
                            }}
                            onOpenAsk={() => setChatOpen(true)}
                            onOpenTrust={() => openTrustFor(currentItem)}
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 py-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
            <span className="text-slate-500">Story</span>
            <span>{storyIndex + 1}</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">{stories.length}</span>
          </div>

          {currentItem && currentPerspectiveCount > 0 ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              {currentItem.story.perspectives.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all",
                    i === perspectiveIndex ? "bg-slate-900/80" : "bg-slate-300/80"
                  )}
                  aria-label={`Perspective ${i + 1}: ${p.label}`}
                  onClick={() => goToPerspective(i)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {hintVisible ? (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
            <div className="rounded-2xl bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white shadow backdrop-blur">
              ↑ ↓ clusters • ← → sources
            </div>
          </div>
        ) : null}

        <FeedDots count={stories.length} activeIndex={storyIndex} />
      </div>
      <SourcesPanel
        title={sourcesItem?.story.title ?? null}
        sources={sourcesItem?.insights.sources ?? null}
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
      />
      <PerspectivesPanel
        title={perspectivesItem?.story.title ?? null}
        insights={perspectivesItem?.insights ?? null}
        open={perspectivesOpen}
        onClose={() => setPerspectivesOpen(false)}
      />
      <TrustPanel
        item={trustItem}
        open={trustOpen}
        onClose={() => setTrustOpen(false)}
        onOpenPerspectives={
          trustItem
            ? () => {
                setPerspectivesItem(trustItem);
                setPerspectivesOpen(true);
              }
            : undefined
        }
      />

      {/* Chat panel */}
      {chatOpen && currentItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-start bg-black/40 pl-3 pr-3 pb-3">
          <div className="w-full max-w-[360px] md:max-w-[min(640px,60vw)] rounded-2xl bg-white shadow-2xl overflow-hidden md:ml-6">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Aks Cerebros</div>
                <div className="text-sm font-semibold text-slate-900 line-clamp-2">{currentItem.story.title}</div>
                <div className="mt-1 text-xs text-slate-500">Answers are limited to this article.</div>
              </div>
              <button
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-3 text-sm text-slate-700">
              {chatMessages.map((message, idx) => (
                <div key={`${message.role}-${idx}`} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 leading-relaxed",
                      message.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {chatLoading ? (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-slate-600">Thinking…</div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>
            {chatError ? (
              <div className="px-5 pb-1 text-xs text-rose-600">{chatError}</div>
            ) : null}
            <form
              className="border-t border-slate-200 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
            >
              <div className="flex items-end gap-3">
                <textarea
                  className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
                  placeholder="Aks Cerebros about this article..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  type="submit"
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold",
                    chatInput.trim() && !chatLoading
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  )}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Keyboard shortcuts help (optional) */}
      {helpOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[430px] md:max-w-[min(900px,75vw)] rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Keyboard shortcuts</div>
              <button
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
                onClick={() => setHelpOpen(false)}
                aria-label="Close shortcuts"
              >
                ✕
              </button>
            </div>
            <div className="p-5 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-y-2">
                <div className="font-semibold">j / ↓</div>
                <div>Next story</div>
                <div className="font-semibold">k / ↑</div>
                <div>Previous story</div>
                <div className="font-semibold">l / →</div>
                <div>Next perspective</div>
                <div className="font-semibold">h / ←</div>
                <div>Previous perspective</div>
                <div className="font-semibold">b</div>
                <div>Toggle bookmark</div>
                <div className="font-semibold">r</div>
                <div>Read full</div>
                <div className="font-semibold">y</div>
                <div>Why am I seeing this</div>
                <div className="font-semibold">c</div>
                <div>Open chat</div>
                <div className="font-semibold">p</div>
                <div>Open compare</div>
                <div className="font-semibold">Esc</div>
                <div>Close panels</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
