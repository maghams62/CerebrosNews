"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PremiumBackground } from "@/components/PremiumBackground";
import { FocusedPanel } from "@/components/FocusedPanel";
import { Chip } from "@/components/profile/Chip";
import { SourceRow } from "@/components/profile/SourceRow";
import { ConnectorCard } from "@/components/profile/ConnectorCard";
import { DEFAULT_APP_STATE } from "@/lib/appState/defaults";
import {
  APP_STATE_EVENT,
  APP_STATE_STORAGE_KEY,
  clearAppState,
  FEED_REFRESH_STORAGE_KEY,
  loadAppState,
  resetPreferencesOnly,
  updateAppState,
} from "@/lib/appState/storage";
import { isOnboardingEnabled } from "@/lib/appState/onboardingFlag";
import { ConnectorId, SourceEntry } from "@/types/appState";
import { DEFAULT_PREFERENCES } from "@/types/preferences";
import { mockFetchConnector } from "@/lib/connectors/mockFetch";

function titleCase(input: string) {
  return input
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function relativeTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function iconForSource(name: string) {
  const map: Record<string, React.ReactNode> = {
    "Google News": "G",
    Reuters: "R",
    HackerNoon: "HN",
    ZDNet: "ZN",
  };
  return map[name] ?? name.slice(0, 1).toUpperCase();
}

type DatasetSource = {
  id: string;
  name: string;
  homepage?: string;
  rss?: string | null;
};

type DatasetSourcesPayload = {
  sources?: DatasetSource[];
};

function datasetSourceToEntry(source: DatasetSource): SourceEntry {
  return {
    id: source.id,
    name: source.name,
    url: source.homepage ?? source.rss ?? "",
    enabled: true,
  };
}

function sourcesEqual(a: SourceEntry[], b: SourceEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, idx) => {
    const other = b[idx];
    return (
      entry.id === other.id &&
      entry.name === other.name &&
      entry.url === other.url &&
      entry.enabled === other.enabled
    );
  });
}

function mergeSources(existing: SourceEntry[], datasetEntries: SourceEntry[]): SourceEntry[] {
  const existingById = new Map(existing.map((s) => [s.id, s]));
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const datasetIds = new Set(datasetEntries.map((s) => s.id));
  const datasetNames = new Set(datasetEntries.map((s) => s.name.toLowerCase()));

  const merged = datasetEntries.map((entry) => {
    const match = existingById.get(entry.id) ?? existingByName.get(entry.name.toLowerCase());
    return match ? { ...entry, enabled: match.enabled } : entry;
  });

  const custom = existing.filter(
    (entry) => !datasetIds.has(entry.id) && !datasetNames.has(entry.name.toLowerCase())
  );
  return [...merged, ...custom];
}

export default function ProfilePage() {
  const router = useRouter();
  const [appState, setAppState] = useState(DEFAULT_APP_STATE);
  const [loaded, setLoaded] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  useEffect(() => {
    const existing = loadAppState();
    if (isOnboardingEnabled() && !existing?.preferences) {
      router.replace("/onboarding?returnTo=/profile");
      return;
    }
    setAppState(existing ?? DEFAULT_APP_STATE);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    const handler = () => {
      const next = loadAppState();
      if (next) setAppState(next);
    };
    const storageHandler = (e: StorageEvent) => {
      if (!e.key || e.key === APP_STATE_STORAGE_KEY) handler();
    };
    window.addEventListener(APP_STATE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(APP_STATE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    async function loadDatasetSources() {
      try {
        const res = await fetch("/data/sources.json");
        if (!res.ok) return;
        const payload = (await res.json()) as DatasetSourcesPayload;
        const datasetSources = Array.isArray(payload.sources) ? payload.sources : [];
        if (!datasetSources.length) return;
        const datasetEntries = datasetSources
          .filter((s) => Boolean(s?.id && s?.name))
          .map((s) => datasetSourceToEntry(s));
        if (!datasetEntries.length || !active) return;
        updateAppState((state) => {
          const merged = mergeSources(state.sources, datasetEntries);
          if (sourcesEqual(state.sources, merged)) return state;
          return { ...state, sources: merged };
        });
      } catch {
        // Ignore dataset load failures; keep existing sources.
      }
    }
    void loadDatasetSources();
    return () => {
      active = false;
    };
  }, [loaded]);

  const prefs = appState.preferences ?? DEFAULT_PREFERENCES;

  const lastSyncLine = useMemo(() => {
    const count = appState.sourcesLastCount ?? 18;
    return `Last sync: ${count} recent stories`;
  }, [appState.sourcesLastCount]);

  function editOnboarding() {
    router.push("/onboarding?mode=edit&returnTo=/profile");
  }

  function resetPrefs() {
    resetPreferencesOnly();
    router.replace("/onboarding?returnTo=/profile");
  }

  function addSource() {
    const name = sourceName.trim();
    const url = sourceUrl.trim();
    if (!name || !url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    updateAppState((state) => ({
      ...state,
      sources: [
        ...state.sources,
        {
          id: id || `source-${state.sources.length + 1}`,
          name,
          url,
          enabled: true,
        },
      ],
    }));
    setSourceName("");
    setSourceUrl("");
  }

  function toggleSource(id: string, next: boolean) {
    updateAppState((state) => ({
      ...state,
      sources: state.sources.map((s) => (s.id === id ? { ...s, enabled: next } : s)),
    }));
  }

  function refreshFeed() {
    const stamp = new Date().toISOString();
    updateAppState((state) => ({
      ...state,
      feedRefreshAt: stamp,
    }));
    try {
      window.localStorage.setItem(FEED_REFRESH_STORAGE_KEY, stamp);
    } catch {
      // ignore
    }
  }

  function updateConnectorTopics(id: ConnectorId, updater: (topics: string[]) => string[]) {
    updateAppState((state) => ({
      ...state,
      connectors: {
        ...state.connectors,
        [id]: {
          ...state.connectors[id],
          topics: updater(state.connectors[id].topics),
        },
      },
    }));
  }

  function toggleConnector(id: ConnectorId, enabled: boolean) {
    updateAppState((state) => ({
      ...state,
      connectors: { ...state.connectors, [id]: { ...state.connectors[id], enabled } },
    }));
  }

  async function runConnectorTest(id: ConnectorId) {
    if (id === "bluesky") {
      const current = appState.connectors[id];
      const mergedTopics = Array.from(new Set([...(prefs?.topics ?? []), ...current.topics]));
      try {
        const res = await fetch("/api/connectors/bluesky", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topics: mergedTopics }),
        });
        const data = (await res.json()) as { items?: unknown; counts?: Record<string, number> };
        const items = Array.isArray(data.items) ? (data.items as any[]) : [];
        updateAppState((state) => ({
          ...state,
          connectors: {
            ...state.connectors,
            [id]: {
              ...current,
              lastSyncAt: new Date().toISOString(),
              lastFetchedCounts: data.counts ?? { posts: items.length },
            },
          },
          cache: {
            ...state.cache,
            connectorItems: { ...state.cache.connectorItems, [id]: items as any },
          },
        }));
      } catch {
        // Ignore errors; UI stays in last known state.
      }
      return;
    }

    updateAppState((state) => {
      const current = state.connectors[id];
      const { items, counts } = mockFetchConnector(id, current.topics);
      return {
        ...state,
        connectors: {
          ...state.connectors,
          [id]: {
            ...current,
            lastSyncAt: new Date().toISOString(),
            lastFetchedCounts: counts,
          },
        },
        cache: {
          ...state.cache,
          connectorItems: { ...state.cache.connectorItems, [id]: items },
        },
      };
    });
  }

  function exportData() {
    if (typeof window === "undefined") return;
    let legacyPrefs: unknown = null;
    const legacyRaw = window.localStorage.getItem("ttn.preferences.v1");
    if (legacyRaw) {
      try {
        legacyPrefs = JSON.parse(legacyRaw) as unknown;
      } catch {
        legacyPrefs = legacyRaw;
      }
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      appState,
      legacyPreferences: legacyPrefs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ttn-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function clearLocalData() {
    clearAppState();
    router.replace("/onboarding?returnTo=/feed");
  }

  if (!loaded) return null;

  return (
    <PremiumBackground>
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <FocusedPanel className="w-[min(1100px,90vw)] h-[min(760px,86vh)]">
          <div className="flex h-full flex-col px-7 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase">My Profile</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">Profile</div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/feed"
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Back to feed
                </Link>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={editOnboarding}
                >
                  Edit onboarding
                </button>
                <button
                  type="button"
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100"
                  onClick={resetPrefs}
                >
                  Reset preferences
                </button>
              </div>
            </div>

            <div className="mt-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
                  <div className="text-lg font-semibold text-slate-900">About You</div>
                  <div className="mt-1 text-xs text-slate-500">From your onboarding tags.</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-900">Role:</span>{" "}
                      {prefs.role ? titleCase(prefs.role) : "Not set"}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Topics:</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {prefs.topics.length ? prefs.topics.map((t) => <Chip key={t} label={t} />) : "None"}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">See less of:</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {prefs.blockedKeywords.length
                          ? prefs.blockedKeywords.map((t) => <Chip key={t} label={t} />)
                          : "None"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    onClick={editOnboarding}
                  >
                    Edit onboarding
                  </button>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Disabling a source removes it from your feed.
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-lg font-semibold text-slate-900">Sources</div>
                    <button
                      type="button"
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      onClick={refreshFeed}
                    >
                      Refresh feed
                    </button>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">RSS / editorial sources</div>
                  <div className="mt-2 text-xs text-slate-500">Choose which sources to include in your feed.</div>

                  <div className="mt-4 space-y-2">
                    {appState.sources.map((source) => (
                      <SourceRow
                        key={source.id}
                        name={source.name}
                        icon={iconForSource(source.name)}
                        enabled={source.enabled}
                        onToggle={(next) => toggleSource(source.id, next)}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      placeholder="Name"
                      className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    <input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="URL"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                      onClick={addSource}
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">Add a custom RSS source to include in your feed.</div>

                  <div className="mt-4 text-xs text-slate-500">{lastSyncLine}</div>
                </section>
              </div>

              <section>
                <div className="text-lg font-semibold text-slate-900">Topic Subscriptions</div>
                <div className="mt-1 text-xs text-slate-500">
                  Soon — connect your socials to fetch news from them.
                </div>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <ConnectorCard
                    title="Hacker News"
                    icon="HN"
                    badge="Soon"
                    enabled={appState.connectors.hn.enabled}
                    onToggle={(next) => toggleConnector("hn", next)}
                    topics={appState.connectors.hn.topics}
                    helperText="Soon — connect your socials to fetch news from them."
                    onAddTopic={(topic) =>
                      updateConnectorTopics("hn", (topics) => Array.from(new Set([...topics, topic])))
                    }
                    onRemoveTopic={(topic) =>
                      updateConnectorTopics("hn", (topics) => topics.filter((t) => t !== topic))
                    }
                    onTest={() => void runConnectorTest("hn")}
                    footer={
                      appState.connectors.hn.lastFetchedCounts?.stories
                        ? `Fetched ${appState.connectors.hn.lastFetchedCounts.stories} recent stories`
                        : "Fetched 18 recent stories"
                    }
                    lastSyncLabel={
                      appState.connectors.hn.lastSyncAt
                        ? `Last sync ${relativeTimeFromIso(appState.connectors.hn.lastSyncAt)}`
                        : undefined
                    }
                  />
                  <ConnectorCard
                    title="Bluesky"
                    icon="B"
                    badge="Soon"
                    enabled={appState.connectors.bluesky.enabled}
                    onToggle={(next) => toggleConnector("bluesky", next)}
                    topics={appState.connectors.bluesky.topics}
                    helperText="Soon — connect your socials to fetch news from them."
                    onAddTopic={(topic) =>
                      updateConnectorTopics("bluesky", (topics) => Array.from(new Set([...topics, topic])))
                    }
                    onRemoveTopic={(topic) =>
                      updateConnectorTopics("bluesky", (topics) => topics.filter((t) => t !== topic))
                    }
                    onTest={() => void runConnectorTest("bluesky")}
                    testLabel="Sync now"
                    footer={
                      appState.connectors.bluesky.lastFetchedCounts?.posts
                        ? `Fetched ${appState.connectors.bluesky.lastFetchedCounts.posts} recent posts`
                        : "Fetched 24 recent posts"
                    }
                    lastSyncLabel={
                      appState.connectors.bluesky.lastSyncAt
                        ? `Last sync ${relativeTimeFromIso(appState.connectors.bluesky.lastSyncAt)}`
                        : undefined
                    }
                  />
                  <ConnectorCard
                    title="GitHub"
                    icon="GH"
                    badge="Soon"
                    enabled={appState.connectors.github.enabled}
                    onToggle={(next) => toggleConnector("github", next)}
                    topics={appState.connectors.github.topics}
                    helperText="Soon — connect your socials to fetch news from them."
                    onAddTopic={(topic) =>
                      updateConnectorTopics("github", (topics) => Array.from(new Set([...topics, topic])))
                    }
                    onRemoveTopic={(topic) =>
                      updateConnectorTopics("github", (topics) => topics.filter((t) => t !== topic))
                    }
                    onTest={() => void runConnectorTest("github")}
                    footer={
                      appState.connectors.github.lastFetchedCounts?.repos
                        ? `Fetched ${appState.connectors.github.lastFetchedCounts.repos} repos and ${appState.connectors.github.lastFetchedCounts.releases ?? 0} releases`
                        : "Fetched 32 repos and 46 releases"
                    }
                    lastSyncLabel={
                      appState.connectors.github.lastSyncAt
                        ? `Last sync ${relativeTimeFromIso(appState.connectors.github.lastSyncAt)}`
                        : undefined
                    }
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
                <div className="text-lg font-semibold text-slate-900">Data Controls</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    onClick={exportData}
                  >
                    Export my data
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100"
                    onClick={clearLocalData}
                  >
                    Clear local data
                  </button>
                </div>
              </section>
            </div>
          </div>
        </FocusedPanel>
      </div>
    </PremiumBackground>
  );
}
