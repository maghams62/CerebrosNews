import { AppStateV1, ConnectorState, SourceEntry } from "@/types/appState";

const DEFAULT_CONNECTOR_STATE: ConnectorState = {
  enabled: true,
  topics: [],
  lastSyncAt: null,
  lastFetchedCounts: null,
};

export const DEFAULT_SOURCES: SourceEntry[] = [
  {
    id: "google-news",
    name: "Google News",
    url: "https://news.google.com/rss",
    enabled: true,
  },
  {
    id: "reuters",
    name: "Reuters",
    url: "https://www.reutersagency.com/feed/?best-topics=tech",
    enabled: true,
  },
  {
    id: "hackernoon",
    name: "HackerNoon",
    url: "https://hackernoon.com/feed",
    enabled: true,
  },
  {
    id: "zdnet",
    name: "ZDNet",
    url: "https://www.zdnet.com/news/rss.xml",
    enabled: true,
  },
];

export const DEFAULT_CONNECTORS: AppStateV1["connectors"] = {
  hn: {
    ...DEFAULT_CONNECTOR_STATE,
    topics: ["AI agents", "GPU", "Rust"],
  },
  bluesky: {
    ...DEFAULT_CONNECTOR_STATE,
    topics: ["OpenAI", "AI agents", "LLMs", "YC W26"],
  },
  github: {
    ...DEFAULT_CONNECTOR_STATE,
    topics: ["AI", "Programming", "Infra", "Kubernetes"],
  },
};

export const DEFAULT_APP_STATE: AppStateV1 = {
  version: 1,
  preferences: null,
  sources: DEFAULT_SOURCES,
  sourcesLastSync: null,
  sourcesLastCount: null,
  feedRefreshAt: null,
  connectors: DEFAULT_CONNECTORS,
  cache: {
    connectorItems: {},
  },
};
