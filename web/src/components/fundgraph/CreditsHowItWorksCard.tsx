"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  DAILY_ACTION_CAPS,
  DAILY_CREDITS_CAP,
  EARN_RULES,
  getNextTier,
  getNextTierThreshold,
  LIMITS_BY_TIER,
  SPEND_RULES,
  TIER_ORDER,
  TIER_THRESHOLDS,
  tierLabel,
} from "@/lib/fundgraph/gamification.shared";
import { useFundGraphState } from "@/fundgraph/state";

function formatLimit(value: number): string {
  return value >= 9999 ? "Full" : String(value);
}

function IconFrame({
  children,
  tone = "slate",
  size = "md",
}: {
  children: ReactNode;
  tone?: "slate" | "emerald" | "amber" | "sky";
  size?: "sm" | "md" | "lg";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : tone === "sky"
          ? "bg-sky-100 text-sky-700"
          : "bg-slate-100 text-slate-700";
  const sizeClass = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return <span className={`inline-flex items-center justify-center rounded-lg ${sizeClass} ${toneClass}`}>{children}</span>;
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="10" cy="5" rx="6" ry="3" />
      <path d="M4 5v6c0 1.7 2.7 3 6 3s6-1.3 6-3V5" />
      <path d="M4 8c0 1.7 2.7 3 6 3s6-1.3 6-3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M6 7h8M6 10h8M6 13h5" />
    </svg>
  );
}

function UpvoteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 4v12" />
      <path d="m6 8 4-4 4 4" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h12v8H8l-3 3v-3H4z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="10" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="15" cy="15" r="2" />
      <path d="m7 9 6-3m-6 5 6 3" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m10 3 1.7 4.3L16 9l-4.3 1.7L10 15l-1.7-4.3L4 9l4.3-1.7L10 3Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V7a3 3 0 1 1 6 0v2" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="4" cy="14" r="2" />
      <circle cx="10" cy="6" r="2" />
      <circle cx="16" cy="11" r="2" />
      <path d="m6 13 3-5m3 0 3 2" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h6l4 4v10H6z" />
      <path d="M12 3v4h4M8 11h6M8 14h6" />
    </svg>
  );
}

function iconForEarnRule(key: string) {
  if (key === "add_source") return <SourceIcon />;
  if (key === "add_comment") return <CommentIcon />;
  if (key === "share_signal") return <ShareIcon />;
  if (key === "upvote") return <UpvoteIcon />;
  if (key === "verify_claim" || key === "dispute_claim") return <CheckIcon />;
  return <SparkIcon />;
}

function iconForSpendRule(key: string) {
  if (key === "memo_generate") return <DocIcon />;
  if (key === "graph_expand") return <GraphIcon />;
  return <LockIcon />;
}

export function CreditsHowItWorksCard({
  className,
  showLearnMore = true,
  showQuickActions = true,
  onAddSignal,
}: {
  className?: string;
  showLearnMore?: boolean;
  showQuickActions?: boolean;
  onAddSignal?: () => void;
}) {
  const { tier, cred, contributions } = useFundGraphState();
  const nextThreshold = getNextTierThreshold(tier);
  const nextTier = getNextTier(tier);
  const currentFloor = TIER_THRESHOLDS[tier];
  const progressDenominator = nextThreshold ? Math.max(1, nextThreshold - currentFloor) : 1;
  const progressNumerator = nextThreshold ? Math.max(0, contributions - currentFloor) : 1;
  const progress = Math.min(100, Math.round((progressNumerator / progressDenominator) * 100));
  const showTopTier = !nextThreshold;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ${className ?? ""}`}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.06 }}
        className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-sky-50/70 to-slate-100 px-6 py-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
              <CoinIcon /> Intelligence Tokens
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Token Credit Ecosystem</h2>
            <p className="mt-1 text-sm text-slate-600">Contribute intelligence, earn tokens, unlock deeper analysis.</p>
          </div>
          {showLearnMore ? (
            <Link
              href="/cerebrosfund/credits"
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Learn more
            </Link>
          ) : null}
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.35 }}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Current Tier</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{tierLabel(tier)}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.13, duration: 0.35 }}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Credit Balance</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{cred}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.35 }}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Contributions</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{contributions}</p>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: 0.07, delayChildren: 0.12 },
          },
        }}
        className="px-6 py-6"
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Progress To Next Tier</p>
            {nextThreshold ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {Math.max(0, nextThreshold - contributions)} to go
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Top tier reached</span>
            )}
          </div>

          {nextThreshold ? (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Next unlock: <span className="font-semibold text-slate-900">{nextTier ? tierLabel(nextTier) : "N/A"}</span> at {nextThreshold} contributions
              </p>
              <div className="mt-3 h-3 w-full rounded-full bg-slate-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.18 }}
                  className="h-3 rounded-full bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
                />
              </div>
            </>
          ) : null}
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mt-6 grid items-start gap-4 xl:grid-cols-2"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <IconFrame tone="emerald" size="lg">
                <CheckIcon />
              </IconFrame>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Earn Credits</p>
                <p className="text-sm text-slate-600">Actions that reward contribution</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {EARN_RULES.map((rule) => (
                <motion.div
                  key={rule.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28 }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 transition hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-slate-800">
                      <IconFrame tone="emerald" size="md">{iconForEarnRule(rule.key)}</IconFrame>
                      <span className="font-semibold">{rule.label}</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-700 tabular-nums">+{rule.deltaCredits}</span>
                  </div>
                  {rule.note ? <p className="mt-1 pl-10 text-xs text-slate-500">{rule.note}</p> : null}
                </motion.div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
              Daily cap: {DAILY_CREDITS_CAP} credits/day · Verify cap: {DAILY_ACTION_CAPS.verify_claim}/day
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <IconFrame tone="amber" size="lg">
                <CoinIcon />
              </IconFrame>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Spend / Costs</p>
                <p className="text-sm text-slate-600">How credits or tier are consumed</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {SPEND_RULES.map((rule) => (
                <motion.div
                  key={rule.key}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28 }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 transition hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-slate-800">
                      <IconFrame tone="amber" size="md">{iconForSpendRule(rule.key)}</IconFrame>
                      <span className="font-semibold">{rule.label}</span>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-700">{rule.costText}</span>
                  </div>
                  {rule.note ? <p className="mt-1 pl-10 text-xs text-slate-500">{rule.note}</p> : null}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Tier Ladder</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {TIER_ORDER.map((tierKey) => {
              const limits = LIMITS_BY_TIER[tierKey];
              const active = tierKey === tier;
              return (
                <motion.article
                  key={tierKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                  className={`rounded-xl border px-3 py-3 ${
                    active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold">{tierLabel(tierKey)}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>
                      {TIER_THRESHOLDS[tierKey]}+
                    </span>
                  </div>
                  <div className={`mt-2 space-y-1 text-[11px] ${active ? "text-slate-100" : "text-slate-600"}`}>
                    <p>Claims: {formatLimit(limits.maxClaimsVisible)}</p>
                    <p>Signals: {formatLimit(limits.maxSignalsVisible)}</p>
                    <p>Graph: depth {limits.graphDepth}</p>
                    <p>Memo: {limits.memoAllowed ? "Enabled" : "Locked"}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
          {showTopTier ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.35 }}
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
            >
              Insider tier active: full intelligence access with advanced filters.
            </motion.p>
          ) : null}
        </motion.div>

        {showQuickActions ? (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-5"
          >
            <Link href="/cerebrosfund/signals" className="inline-flex h-9 items-center gap-1 rounded-full bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800">
              <SparkIcon /> Publish new signal
            </Link>
            {onAddSignal ? (
              <button
                type="button"
                onClick={onAddSignal}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <SparkIcon /> Publish new signal
              </button>
            ) : (
              <Link href="/cerebrosfund/signals" className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <SparkIcon /> Signals feed
              </Link>
            )}
            <Link href="/feed" className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <SourceIcon /> Add a source
            </Link>
          </motion.div>
        ) : null}
      </motion.div>
    </motion.section>
  );
}
