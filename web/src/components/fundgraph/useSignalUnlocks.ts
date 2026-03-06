"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFundGraphState } from "@/fundgraph/state";
import { spend } from "@/lib/fundgraph/client";
import { SIGNAL_UNLOCK_COST, signalUnlockStorageKey } from "@/lib/fundgraph/signalPaywall";

const SIGNAL_UNLOCKS_UPDATED_EVENT = "fundgraph:signal-unlocks-updated";
const SIGNAL_UNLOCKS_RESET_EVENT = "fundgraph:signal-unlocks-reset";

type UnlocksUpdatedDetail = {
  userId?: string;
  signalId?: string;
  reset?: boolean;
};

export function useSignalUnlocks() {
  const { userId, applyGamification } = useFundGraphState();
  const storageKey = useMemo(() => signalUnlockStorageKey(userId), [userId]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setUnlocked(new Set());
      } else {
        const parsed = JSON.parse(raw) as unknown;
        const ids = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
        setUnlocked(new Set(ids));
      }
    } catch {
      setUnlocked(new Set());
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(unlocked)));
  }, [hydrated, storageKey, unlocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function applyUpdate(detail: UnlocksUpdatedDetail | undefined) {
      if (detail?.userId && detail.userId !== userId) return;
      if (detail?.reset) {
        setUnlocked(new Set());
        setUnlockError(null);
        return;
      }
      if (detail?.signalId) {
        setUnlocked((prev) => {
          const next = new Set(prev);
          next.add(detail.signalId as string);
          return next;
        });
      }
    }

    function onUpdated(event: Event) {
      applyUpdate((event as CustomEvent<UnlocksUpdatedDetail>).detail);
    }

    function onReset(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      applyUpdate({ userId: detail?.userId, reset: true });
    }

    window.addEventListener(SIGNAL_UNLOCKS_UPDATED_EVENT, onUpdated as EventListener);
    window.addEventListener(SIGNAL_UNLOCKS_RESET_EVENT, onReset as EventListener);
    return () => {
      window.removeEventListener(SIGNAL_UNLOCKS_UPDATED_EVENT, onUpdated as EventListener);
      window.removeEventListener(SIGNAL_UNLOCKS_RESET_EVENT, onReset as EventListener);
    };
  }, [userId]);

  const isUnlocked = useCallback((signalId: string): boolean => unlocked.has(signalId), [unlocked]);

  const unlockSignal = useCallback(
    async (signalId: string) => {
      setUnlockError(null);
      setUnlockingId(signalId);
      try {
        const snapshot = await spend(SIGNAL_UNLOCK_COST, "unlock_signal_intelligence", signalId, userId);
        applyGamification(snapshot);
        setUnlocked((prev) => {
          const next = new Set(prev);
          next.add(signalId);
          return next;
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<UnlocksUpdatedDetail>(SIGNAL_UNLOCKS_UPDATED_EVENT, {
              detail: { userId, signalId },
            })
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to unlock advanced analysis.";
        if (message === "insufficient_credits") {
          setUnlockError("You need more balance to unlock deep analysis.");
        } else {
          setUnlockError(message);
        }
      } finally {
        setUnlockingId(null);
      }
    },
    [applyGamification, userId]
  );

  return {
    isUnlocked,
    unlockSignal,
    unlockingId,
    unlockError,
  };
}
