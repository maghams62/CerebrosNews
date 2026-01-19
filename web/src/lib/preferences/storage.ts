import { DEFAULT_PREFERENCES, Preferences } from "@/types/preferences";

export const STORAGE_KEY = "ttn.preferences.v1";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function readPreferencesFromUnknown(v: unknown): Preferences | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;

  const topics = isStringArray(o.topics) ? o.topics : DEFAULT_PREFERENCES.topics;
  const blockedKeywords = isStringArray(o.blockedKeywords) ? o.blockedKeywords : DEFAULT_PREFERENCES.blockedKeywords;
  const role = typeof o.role === "string" ? o.role : DEFAULT_PREFERENCES.role;

  const biasMode =
    o.biasMode === "balanced" ||
    o.biasMode === "skeptical-first" ||
    o.biasMode === "optimistic-first" ||
    o.biasMode === "neutral-only"
      ? o.biasMode
      : DEFAULT_PREFERENCES.biasMode;

  const depthMode =
    o.depthMode === "fast-scan" || o.depthMode === "explain-things" || o.depthMode === "deep-dive"
      ? o.depthMode
      : DEFAULT_PREFERENCES.depthMode;

  return { topics, blockedKeywords, role, biasMode, depthMode };
}

export function loadPreferences(): Preferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return readPreferencesFromUnknown(parsed);
  } catch {
    return null;
  }
}

export function savePreferences(prefs: Preferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function clearPreferences() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

