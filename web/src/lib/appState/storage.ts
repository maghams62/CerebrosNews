import { AppStateV1, ConnectorId, ConnectorState, SourceEntry } from "@/types/appState";
import { DEFAULT_APP_STATE, DEFAULT_CONNECTORS, DEFAULT_SOURCES } from "@/lib/appState/defaults";
import { clearPreferences, loadPreferences, readPreferencesFromUnknown, STORAGE_KEY as LEGACY_PREFS_KEY } from "@/lib/preferences/storage";

export const APP_STATE_STORAGE_KEY = "ttn.appState.v1";
export const APP_STATE_EVENT = "ttn:appState";
export const FEED_REFRESH_STORAGE_KEY = "ttn.feedRefresh.v1";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSourceEntry(v: unknown): v is SourceEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.url === "string" &&
    typeof o.enabled === "boolean"
  );
}

function normalizeSources(v: unknown): SourceEntry[] {
  if (!Array.isArray(v)) return DEFAULT_SOURCES;
  const parsed = v.filter(isSourceEntry);
  return parsed.length ? parsed : DEFAULT_SOURCES;
}

function normalizeConnector(id: ConnectorId, v: unknown): ConnectorState {
  const base = DEFAULT_CONNECTORS[id];
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const topics = Array.isArray(o.topics) ? o.topics.filter((t) => typeof t === "string") : base.topics;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    topics,
    lastSyncAt: typeof o.lastSyncAt === "string" ? o.lastSyncAt : null,
    lastFetchedCounts: (o.lastFetchedCounts && typeof o.lastFetchedCounts === "object" ? (o.lastFetchedCounts as Record<string, number>) : null),
  };
}

function normalizeConnectors(v: unknown): AppStateV1["connectors"] {
  const o = (v && typeof v === "object" ? (v as Record<string, unknown>) : {}) as Record<ConnectorId, unknown>;
  return {
    hn: normalizeConnector("hn", o.hn),
    bluesky: normalizeConnector("bluesky", o.bluesky),
    github: normalizeConnector("github", o.github),
  };
}

function normalizeCache(v: unknown): AppStateV1["cache"] {
  if (!v || typeof v !== "object") return DEFAULT_APP_STATE.cache;
  const o = v as Record<string, unknown>;
  const connectorItems = (o.connectorItems && typeof o.connectorItems === "object"
    ? (o.connectorItems as AppStateV1["cache"]["connectorItems"])
    : {});
  return { connectorItems };
}

export function readAppStateFromUnknown(v: unknown): AppStateV1 | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const preferences = readPreferencesFromUnknown(o.preferences);
  return {
    version: 1,
    preferences,
    sources: normalizeSources(o.sources),
    sourcesLastSync: typeof o.sourcesLastSync === "string" ? o.sourcesLastSync : null,
    sourcesLastCount: typeof o.sourcesLastCount === "number" ? o.sourcesLastCount : null,
    feedRefreshAt: typeof o.feedRefreshAt === "string" ? o.feedRefreshAt : null,
    connectors: normalizeConnectors(o.connectors),
    cache: normalizeCache(o.cache),
  };
}

function emitAppStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_STATE_EVENT));
}

function readFromStorage(storage: Storage | null): AppStateV1 | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return readAppStateFromUnknown(parsed);
  } catch {
    return null;
  }
}

function saveRaw(state: AppStateV1) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
  emitAppStateChanged();
}

function migrateLegacyPreferences(): AppStateV1 | null {
  const prefs = loadPreferences();
  if (!prefs) return null;
  const migrated: AppStateV1 = { ...DEFAULT_APP_STATE, preferences: prefs };
  saveRaw(migrated);
  return migrated;
}

export function loadAppState(): AppStateV1 | null {
  const session = getSessionStorage();
  const sessionState = readFromStorage(session);
  if (sessionState) return sessionState;

  const localState = readFromStorage(getLocalStorage());
  if (localState) {
    saveRaw(localState);
    getLocalStorage()?.removeItem(APP_STATE_STORAGE_KEY);
    return localState;
  }

  return migrateLegacyPreferences();
}

export function saveAppState(state: AppStateV1) {
  saveRaw(state);
}

export function updateAppState(mutator: (prev: AppStateV1) => AppStateV1) {
  const current = loadAppState() ?? DEFAULT_APP_STATE;
  const next = mutator(current);
  saveRaw(next);
}

export function clearAppState() {
  getSessionStorage()?.removeItem(APP_STATE_STORAGE_KEY);
  getLocalStorage()?.removeItem(APP_STATE_STORAGE_KEY);
  getLocalStorage()?.removeItem(LEGACY_PREFS_KEY);
  clearPreferences();
  emitAppStateChanged();
}

export function resetPreferencesOnly() {
  const current = loadAppState() ?? DEFAULT_APP_STATE;
  const next = { ...current, preferences: null };
  saveRaw(next);
  getLocalStorage()?.removeItem(LEGACY_PREFS_KEY);
}
