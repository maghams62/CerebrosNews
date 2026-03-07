export const SIGNAL_INTELLIGENCE_UNLOCK_COST = 5;
export const SIGNAL_UNLOCK_COST = SIGNAL_INTELLIGENCE_UNLOCK_COST;
export const SIGNAL_UNLOCK_STORAGE_PREFIX = "fundgraph_signal_unlocks_v2";

export function signalUnlockStorageKey(userId: string): string {
  const key = userId.trim() || "demo";
  return `${SIGNAL_UNLOCK_STORAGE_PREFIX}:${key}`;
}
