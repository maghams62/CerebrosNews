"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFundGraphState } from "@/fundgraph/state";
import { tierLabel } from "@/lib/fundgraph/gamification.shared";

export function FundGraphUnlockBadge({
  onAddSignal,
}: {
  onAddSignal?: () => void;
}) {
  const { tier, cred } = useFundGraphState();
  const [open, setOpen] = useState(false);

  function handleAddSignal() {
    setOpen(false);
    onAddSignal?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open credits"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-base transition hover:bg-slate-50"
      >
        <span aria-hidden>⚡</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Intelligence Tokens</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {tierLabel(tier)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">Tokens: <span className="font-semibold text-slate-900">{cred}</span></p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Earn</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                    <li>+ Verify claim</li>
                    <li>+ Cite source</li>
                    <li>+ Submit signal</li>
                    <li>+ Add comment</li>
                    <li>+ Share signal</li>
                  </ul>
                  <button
                    type="button"
                    onClick={handleAddSignal}
                    className="mt-3 h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Publish New Signal
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Spend</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                    <li>Unlock advanced signal intelligence (-5)</li>
                    <li>Generate memo (-2)</li>
                    <li>Unlock claims</li>
                    <li>Unlock graph depth</li>
                  </ul>
                  <Link
                    href="/cerebrosfund/profile"
                    onClick={() => setOpen(false)}
                    className="mt-3 inline-flex h-9 items-center rounded-full bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    Open full dashboard
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
