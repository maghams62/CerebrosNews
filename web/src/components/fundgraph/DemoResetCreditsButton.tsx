"use client";

import { useState } from "react";
import { useFundGraphState } from "@/fundgraph/state";
import { resetUserCredits } from "@/lib/fundgraph/client";
import { signalUnlockStorageKey } from "@/lib/fundgraph/signalPaywall";

export function DemoResetCreditsButton() {
  const { userId, applyGamification } = useFundGraphState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await resetUserCredits(userId);
      applyGamification(snapshot);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(signalUnlockStorageKey(userId));
        window.dispatchEvent(new CustomEvent("fundgraph:signal-unlocks-reset", { detail: { userId } }));
        window.dispatchEvent(new CustomEvent("fundgraph:signal-unlocks-updated", { detail: { userId, reset: true } }));
      }
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "Failed to reset credits.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "Resetting..." : "Reset Tokens"}
      </button>
      {error ? <p className="text-[10px] text-rose-700">{error}</p> : null}
    </div>
  );
}
