import { extractAndStoreClaimsFromSource } from "@/lib/fundgraph/claimProcessing";
import { sourceToNewsSource } from "@/lib/fundgraph/ingestion";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { listNewsSources } from "@/lib/fundgraph/newsSource";
import { addSource, getSourceById } from "@/lib/fundgraph/store.contract";
import { getClaimLinks, getClaims } from "@/lib/fundgraph/store";
import { NewsSource, Source } from "@/lib/fundgraph/types";

function asSource(input: NewsSource): Source {
  return {
    id: input.id,
    type: "NEWS_ARTICLE",
    title: input.title,
    url: input.url,
    rawText: input.content || input.summary || "",
    createdAt: input.publishedAt || new Date().toISOString(),
    metadata: {
      sourceName: input.sourceName,
      tags: input.tags,
      publishedAt: input.publishedAt,
    },
  };
}

function withLinksByClaim<T extends { id: string }>(
  claims: T[],
  allLinks: Awaited<ReturnType<typeof getClaimLinks>>
): Array<T & { links: typeof allLinks }> {
  const linksByClaimId = new Map<string, typeof allLinks>();
  for (const link of allLinks) {
    const bucket = linksByClaimId.get(link.claimId) ?? [];
    bucket.push(link);
    linksByClaimId.set(link.claimId, bucket);
  }
  return claims.map((claim) => ({
    ...claim,
    links: linksByClaimId.get(claim.id) ?? [],
  }));
}

export async function extractClaimsFromNewsSource(source: NewsSource, force = false) {
  const mode = getFundgraphDataMode();
  const existingClaims = await getClaims();
  const already = existingClaims.filter((claim) => claim.sourceId === source.id);

  if (already.length && !force) {
    const allLinks = await getClaimLinks();
    return {
      mode,
      source,
      claims: withLinksByClaim(already, allLinks),
      cached: true,
      realModePlaceholder: mode === "real",
    };
  }

  const existingSource = await getSourceById(source.id);
  if (!existingSource) {
    await addSource(asSource(source));
  }

  const extraction = await extractAndStoreClaimsFromSource(source);
  return {
    mode,
    source,
    claims: withLinksByClaim(extraction.claims, extraction.links),
    cached: false,
    realModePlaceholder: mode === "real",
  };
}

export async function extractClaimsFromStoredSource(sourceId: string, force = false) {
  const source = await getSourceById(sourceId);
  if (!source) return { error: "source_not_found" as const };
  if (source.rawText.trim().length < 20) {
    return {
      error: "insufficient_source_text" as const,
      detail: "Source text is too short. Add extracted content before running claim extraction.",
    };
  }

  const response = await extractClaimsFromNewsSource(sourceToNewsSource(source), force);
  return {
    ...response,
    source,
  };
}

export async function bootstrapClaimsIfEmpty(limit = 5): Promise<void> {
  const existing = await getClaims();
  if (existing.length) return;

  const sources = await listNewsSources(Math.max(1, Math.min(limit, 10)));
  for (const source of sources) {
    try {
      await extractClaimsFromNewsSource(source, false);
    } catch {
      // Best-effort bootstrap; continue on source-level failures.
    }
  }
}
