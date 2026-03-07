import { DEMO_INVESTING_TAG, getCerebrosDemoMode, readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { NewsClaim, Signal, Source } from "@/lib/fundgraph/types";

export function isInvestingDemoMode(): boolean {
  return getCerebrosDemoMode() === "investing";
}

async function demoArticleIdSet(): Promise<Set<string> | null> {
  if (!isInvestingDemoMode()) return null;
  const dataset = await readOfflineDataset();
  const ids = new Set<string>();
  for (const item of dataset?.items ?? []) {
    ids.add(item.id);
  }
  return ids;
}

export async function filterClaimsForDemoMode(claims: NewsClaim[]): Promise<NewsClaim[]> {
  const allowed = await demoArticleIdSet();
  if (!allowed) return claims;
  return claims.filter((claim) => allowed.has(claim.sourceId));
}

export async function filterSourcesForDemoMode(sources: Source[]): Promise<Source[]> {
  const allowed = await demoArticleIdSet();
  if (!allowed) return sources;
  return sources.filter((source) => allowed.has(source.id));
}

export function filterSignalsForDemoMode(signals: Signal[]): Signal[] {
  if (!isInvestingDemoMode()) return signals;
  return signals.filter((signal) => Array.isArray(signal.tags) && signal.tags.includes(DEMO_INVESTING_TAG));
}

export function filterClaimLinksByClaims<T extends { claimId: string }>(
  links: T[],
  claims: Array<{ id: string }>
): T[] {
  const allowedClaimIds = new Set(claims.map((claim) => claim.id));
  return links.filter((link) => allowedClaimIds.has(link.claimId));
}
