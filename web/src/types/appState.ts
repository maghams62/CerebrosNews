import { Preferences } from "@/types/preferences";
import { FeedItem } from "@/types/feed";

export type SourceEntry = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type ConnectorId = "hn" | "bluesky" | "github";

export type ConnectorState = {
  enabled: boolean;
  topics: string[];
  lastSyncAt: string | null;
  lastFetchedCounts: Record<string, number> | null;
};

export type AppStateCache = {
  connectorItems: Partial<Record<ConnectorId, FeedItem[]>>;
};

export type AppStateV1 = {
  version: 1;
  preferences: Preferences | null;
  sources: SourceEntry[];
  sourcesLastSync: string | null;
  sourcesLastCount: number | null;
  feedRefreshAt: string | null;
  connectors: Record<ConnectorId, ConnectorState>;
  cache: AppStateCache;
};
