"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PremiumBackground } from "@/components/PremiumBackground";
import { cn } from "@/lib/cn";
import { DEFAULT_PREFERENCES, Preferences } from "@/types/preferences";
import { loadAppState, updateAppState } from "@/lib/appState/storage";
import { isOnboardingDisabled } from "@/lib/appState/onboardingFlag";
import { HIGH_SIGNAL_TAGS } from "@/lib/tags/highSignal";

const ROLES: Array<{ key: string; title: string; desc: string }> = [
  { key: "founder", title: "Founder", desc: "Building companies and shipping fast." },
  { key: "engineer", title: "Engineer", desc: "Hands-on with systems, code, and tools." },
  { key: "product", title: "Product", desc: "Prioritizing what matters and why." },
  { key: "researcher", title: "Researcher", desc: "Digging for depth, nuance, and evidence." },
  { key: "investor", title: "Investor", desc: "Tracking markets, teams, and momentum." },
  { key: "designer", title: "Designer", desc: "Clarity, craft, and user-centered thinking." },
  { key: "generalist", title: "Generalist", desc: "A bit of everything — connect the dots." },
] as const;

type ExtractTagsResponse = { tags?: unknown; mode?: "openai" | "heuristic" };
type TagsResponse = { tags?: unknown };

const TOTAL_STEPS = 3; // 0..2

function activeTagName(): string {
  const el = document.activeElement as HTMLElement | null;
  return el?.tagName?.toLowerCase?.() ?? "";
}

function isTypingContext(): boolean {
  const el = document.activeElement as HTMLElement | null;
  const tag = activeTagName();
  return tag === "input" || tag === "textarea" || Boolean(el?.isContentEditable);
}

function uniqStrings(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

export default function OnboardingPage() {
  const router = useRouter();
  const [paramsReady, setParamsReady] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [returnTo, setReturnTo] = useState("/feed");
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagsStatus, setTagsStatus] = useState<"loading" | "ready" | "error">("loading");

  const [likeText, setLikeText] = useState("");
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [genMode, setGenMode] = useState<"openai" | "heuristic" | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  const EASE = [0.22, 1, 0.36, 1] as const;
  const slideVariants = {
    enter: (d: 1 | -1) => ({ opacity: 0, x: d > 0 ? 28 : -28 }),
    center: { opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE } },
    exit: (d: 1 | -1) => ({ opacity: 0, x: d > 0 ? -28 : 28, transition: { duration: 0.22, ease: EASE } }),
  } as const;

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const mode = sp.get("mode");
    const returnTo = sp.get("returnTo") || "/feed";
    setIsEdit(mode === "edit");
    setReturnTo(returnTo);
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    // If onboarding is disabled, bounce to the feed (unless explicitly editing).
    if (isOnboardingDisabled() && !isEdit) {
      router.replace(returnTo);
      return;
    }
    // When onboarding is enabled, always show the flow; no auto-skip.
  }, [isEdit, paramsReady, returnTo, router]);

  useEffect(() => {
    const existing = loadAppState()?.preferences;
    if (existing) setPrefs(existing);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setTagsStatus("loading");
      try {
        const res = await fetch("/api/onboarding/tags");
        const data = (await res.json()) as TagsResponse;
        const tags = Array.isArray(data?.tags) ? (data.tags as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean) : [];
        if (cancelled) return;
        setAvailableTags(uniqStrings(tags));
        setTagsStatus("ready");
      } catch {
        if (cancelled) return;
        setAvailableTags([]);
        setTagsStatus("error");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  function goTo(to: number) {
    if (to < 0 || to >= TOTAL_STEPS) return;
    if (to === step) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  function goNext() {
    if (step >= TOTAL_STEPS - 1) {
      finish();
      return;
    }
    goTo(step + 1);
  }

  function goBack() {
    if (step <= 0) return;
    goTo(step - 1);
  }

  function finish() {
    updateAppState((state) => ({ ...state, preferences: prefs }));
    router.replace(returnTo);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingContext()) return;

      if (e.key === "Backspace") {
        if (step > 0) {
          e.preventDefault();
          goBack();
        }
        return;
      }

      if (e.key === "Enter" && e.shiftKey) {
        if (step > 0) {
          e.preventDefault();
          goBack();
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (step >= TOTAL_STEPS - 1) finish();
        else goNext();
        return;
      }

      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (step >= TOTAL_STEPS - 1) finish();
        else goNext();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateTagsFromText() {
    const text = likeText.trim();
    if (!text || genLoading) return;
    setGenLoading(true);
    try {
      const res = await fetch("/api/onboarding/extract-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, allowedTags: availableTags }),
      });
      const data = (await res.json()) as ExtractTagsResponse;
      const tags = Array.isArray(data?.tags) ? (data.tags as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean) : [];
      setGeneratedTags(uniqStrings(tags).slice(0, 6));
      setGenMode(data?.mode === "openai" ? "openai" : "heuristic");
    } catch {
      // Keep demo flowing; just clear output.
      setGeneratedTags([]);
      setGenMode("heuristic");
    } finally {
      setGenLoading(false);
    }
  }

  const tagsForChips = useMemo(() => {
    // In case dataset tags fail to load, still let the UI render.
    if (tagsStatus === "ready" && availableTags.length) return availableTags;
    return HIGH_SIGNAL_TAGS;
  }, [availableTags, tagsStatus]);

  function renderStepContent(stepIndex: number) {
    if (stepIndex === 0) {
      return (
        <>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-semibold text-white">What do you like?</div>
            <div className="mt-3 text-sm md:text-base text-slate-200/90">Pick a few tags — or just describe what you like.</div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {tagsForChips.map((t) => {
              const selected = prefs.topics.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-all duration-150 active:scale-[0.98]",
                    selected
                      ? "bg-white/25 text-white ring-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_12px_28px_rgba(99,102,241,0.35)] scale-[1.03]"
                      : "bg-white/10 text-slate-100 ring-white/15 hover:bg-white/15"
                  )}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      topics: selected ? p.topics.filter((x) => x !== t) : [...p.topics, t],
                    }))
                  }
                >
                  {selected ? "✓ " : ""}
                  {t}
                </button>
              );
            })}
          </div>

          <div className="mt-10">
            <div className="text-center text-sm text-slate-200/80">Or describe what you like</div>
            <div className="mt-3 rounded-2xl ring-1 ring-white/15 bg-white/10 px-3 py-3">
              <textarea
                value={likeText}
                onChange={(e) => setLikeText(e.target.value)}
                placeholder="e.g. AI product launches, devtools, startups, security, design, and founder stories…"
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-200/70">
                  {genMode ? `Generated via ${genMode === "openai" ? "LLM" : "demo mode"}` : tagsStatus === "error" ? "Tag list failed to load (demo fallback)" : " "}
                </div>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold ring-1 transition-colors",
                    genLoading ? "bg-white/10 text-slate-200/70 ring-white/15 cursor-not-allowed" : "bg-white/20 text-white ring-white/25 hover:bg-white/25"
                  )}
                  onClick={generateTagsFromText}
                  disabled={genLoading}
                >
                  {genLoading ? "Generating…" : "Generate tags"}
                </button>
              </div>
            </div>

            {generatedTags.length ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {generatedTags.map((t) => {
                  const selected = prefs.topics.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all duration-150 active:scale-[0.98]",
                        selected
                          ? "bg-white/25 text-white ring-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_10px_24px_rgba(99,102,241,0.35)] scale-[1.03]"
                          : "bg-white/10 text-slate-100 ring-white/15 hover:bg-white/15"
                      )}
                      onClick={() =>
                        setPrefs((p) => ({
                          ...p,
                          topics: selected ? p.topics.filter((x) => x !== t) : [...p.topics, t],
                        }))
                      }
                      aria-label={`Add ${t}`}
                    >
                      {selected ? "✓ " : ""}
                      {t}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      );
    }

    if (stepIndex === 1) {
      return (
        <>
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-semibold text-white">What do you not like?</div>
            <div className="mt-3 text-sm text-slate-200/80">Pick tags you’d like to see less of.</div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {tagsForChips.map((t) => {
              const selected = prefs.blockedKeywords.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-all duration-150 active:scale-[0.98]",
                    selected
                      ? "bg-white/25 text-white ring-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_12px_28px_rgba(239,68,68,0.35)] scale-[1.03]"
                      : "bg-white/10 text-slate-100 ring-white/15 hover:bg-white/15"
                  )}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      blockedKeywords: selected ? p.blockedKeywords.filter((x) => x !== t) : [...p.blockedKeywords, t],
                    }))
                  }
                >
                  {selected ? "✓ " : ""}
                  {t}
                </button>
              );
            })}
          </div>
        </>
      );
    }

    // stepIndex === 2
    return (
      <>
        <div className="text-center">
          <div className="text-3xl md:text-4xl font-semibold text-white">What best describes you?</div>
          <div className="mt-3 text-sm text-slate-200/80">This is just for tailoring the vibe (demo).</div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((r) => {
            const active = prefs.role === r.key;
            return (
              <button
                key={r.key}
                type="button"
                className={cn(
                  "rounded-2xl ring-1 px-4 py-4 text-left transition-colors",
                  active ? "ring-indigo-400 bg-indigo-500/15" : "ring-white/15 bg-white/10 hover:bg-white/15"
                )}
                onClick={() => setPrefs((p) => ({ ...p, role: r.key }))}
              >
                <div className="text-sm font-semibold text-white">{r.title}</div>
                <div className="mt-1 text-xs text-slate-200/80">{r.desc}</div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderPanel(stepIndex: number) {
    const nextLabel = stepIndex >= TOTAL_STEPS - 1 ? "View your feed →" : "Next";
    const showBack = stepIndex > 0;
    const showSkip = true; // demo: always skippable

    return (
      <div className="w-full">
        {renderStepContent(stepIndex)}

        <div className="mt-12 flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            {showBack ? (
              <button type="button" className="text-sm font-medium text-slate-200/90 hover:text-white" onClick={goBack}>
                ‹ Back
              </button>
            ) : (
              <div className="w-14" />
            )}
            {showSkip ? (
              <button
                type="button"
                className="text-sm font-medium text-slate-200/70 hover:text-white"
                onClick={() => {
                  if (stepIndex >= TOTAL_STEPS - 1) finish();
                  else goNext();
                }}
              >
                Skip
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2" aria-label="Progress">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i === stepIndex ? "bg-white/70" : "bg-white/20"
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-xs text-slate-200/70">Press Enter</div>
            <button
              type="button"
              className="text-sm font-semibold text-white/90 hover:text-white"
              onClick={() => {
                if (stepIndex >= TOTAL_STEPS - 1) finish();
                else goNext();
              }}
            >
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PremiumBackground>
      <div className="min-h-[100dvh] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[980px]">
          <AnimatePresence initial={false} custom={dir} mode="wait">
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className="relative rounded-[34px] px-9 py-10 md:px-12 md:py-12">
                {/* Card surface */}
                <div
                  className="absolute inset-0 rounded-[34px] ring-1 ring-white/15 bg-white/8 backdrop-blur-xl"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0.08) 100%)",
                  }}
                />
                {/* Soft inner highlight + drop shadow */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-[34px] opacity-90"
                  style={{
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.25), 0 40px 120px rgba(0,0,0,0.55)",
                  }}
                />
                <div className="relative">
                  <div className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/80">
                    Hi from CerebroNews
                  </div>
                  {renderPanel(step)}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </PremiumBackground>
  );
}

