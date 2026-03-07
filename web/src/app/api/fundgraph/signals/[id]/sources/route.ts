import { NextResponse } from "next/server";
import { z } from "zod";
import { computeSignalArticleQuality } from "@/lib/fundgraph/signalArticleQuality";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { readFunds } from "@/lib/fundgraph/storage";
import { addSignalSourceCitation, addSource, getSignalById, mutateFundgraphDb, readFundgraphDb } from "@/lib/fundgraph/store";
import { hasHardScrapeNoise, isLikelyBoilerplateScrapeText, normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";
import { EvidenceSourceType, EvidenceVisibility, NewsClaim, Signal, Source, SourceType } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const evidenceSourceValues: [EvidenceSourceType, ...EvidenceSourceType[]] = [
  "PUBLIC_ARTICLE",
  "TWEET_THREAD",
  "PODCAST",
  "YOUTUBE_VIDEO",
  "PASTED_TEXT",
  "PRIVATE_INTEL",
  "FOUNDER_NOTE",
  "LP_NOTE",
  "GP_NOTE",
  "FUND_DECK",
  "OTHER",
];

const visibilityValues: [EvidenceVisibility, ...EvidenceVisibility[]] = ["PUBLIC", "PRIVATE", "ANONYMOUS"];

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  sourceType: z.enum(evidenceSourceValues),
  visibility: z.enum(visibilityValues),
  title: z.string().trim().max(280).optional(),
  url: z.string().url().max(2000).optional(),
  snippet: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
});

function toSourceType(type: EvidenceSourceType): SourceType {
  if (type === "PUBLIC_ARTICLE") return "NEWS_ARTICLE";
  if (type === "TWEET_THREAD") return "TWEET_THREAD_TEXT";
  if (type === "FUND_DECK") return "PDF_TEXT";
  return "PASTED_TEXT";
}

function canonicalizeUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const removable = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ref",
      "source",
    ];
    for (const key of removable) parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    const canonical = parsed.toString();
    return canonical.endsWith("/") ? canonical.slice(0, -1) : canonical;
  } catch {
    return url.trim();
  }
}

function gatherRelatedClaims(signal: Signal, claims: NewsClaim[]): NewsClaim[] {
  const claimIdSet = new Set((signal.claimIds ?? []).map((id) => String(id)));
  const evidenceUrl = canonicalizeUrl(signal.evidenceUrl ?? signal.evidence?.url);
  const related = claims.filter((claim) => {
    if (claimIdSet.has(claim.id)) return true;
    if (signal.sourceId && claim.sourceId === signal.sourceId) return true;
    if ((claim.linkedFundIds ?? []).includes(signal.fundId)) {
      const claimUrl = canonicalizeUrl(claim.citation?.url);
      if (evidenceUrl && claimUrl && claimUrl === evidenceUrl) return true;
    }
    return false;
  });
  return related.sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)).slice(0, 8);
}

function gatherRelatedSources(signal: Signal, sources: Source[], claims: NewsClaim[]): Source[] {
  const sourceIdSet = new Set<string>();
  if (signal.sourceId) sourceIdSet.add(signal.sourceId);
  for (const claim of claims) sourceIdSet.add(claim.sourceId);
  const evidenceUrl = canonicalizeUrl(signal.evidenceUrl ?? signal.evidence?.url);

  const related = sources.filter((source) => {
    if (String(source.metadata?.signalId ?? "") === signal.id) return true;
    if (sourceIdSet.has(source.id)) return true;
    if (evidenceUrl && canonicalizeUrl(source.url) === evidenceUrl) return true;
    return false;
  });

  const seen = new Set<string>();
  const deduped: Source[] = [];
  for (const source of related.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
    const sourceText = `${source.title ?? ""} ${source.rawText ?? ""}`;
    if (hasHardScrapeNoise(sourceText) || isLikelyBoilerplateScrapeText(sourceText)) continue;
    const key = source.id || canonicalizeUrl(source.url) || source.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [signal, db, funds] = await Promise.all([getSignalById(id), readFundgraphDb(), readFunds()]);
  if (!signal) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }
  const claims = gatherRelatedClaims(signal, db.claims ?? []);
  const sources = gatherRelatedSources(signal, db.sources ?? [], claims).map((source) => ({
    ...source,
    title: normalizeFundgraphText(source.title || "Signal citation", 240) || "Signal citation",
    rawText: normalizeFundgraphText(source.rawText || "", 3000),
  }));
  const primarySource =
    sources.find((source) => signal.sourceId && source.id === signal.sourceId) ??
    sources.find((source) => canonicalizeUrl(source.url) === canonicalizeUrl(signal.evidenceUrl ?? signal.evidence?.url)) ??
    sources[0] ??
    null;

  let hydratedSignal: Signal | null = null;
  if ((!signal.articleSnapshot || !signal.qualityTier) && primarySource) {
    const fund = funds.find((entry) => entry.id === signal.fundId) ?? null;
    const quality = computeSignalArticleQuality({
      signal,
      fund,
      source: primarySource,
      claims,
      nowIso: new Date().toISOString(),
    });
    hydratedSignal = await mutateFundgraphDb<Signal | null>((draft) => {
      const target = draft.signals.find((item) => item.id === signal.id);
      if (!target) return null;
      target.sourceId = target.sourceId || primarySource.id;
      target.sourceTitle = target.sourceTitle || primarySource.title;
      target.claimIds = Array.from(new Set([...(target.claimIds ?? []), ...claims.map((claim) => claim.id)]));
      target.qualityTier = quality.qualityTier;
      target.alignmentScore = quality.alignmentScore;
      target.citationMatchScore = quality.citationMatchScore;
      target.qualityReasons = quality.qualityReasons;
      target.articleSnapshot = quality.articleSnapshot;
      return target;
    });
  }

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signalId: id,
    count: sources.length,
    sources,
    signal: hydratedSignal,
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await context.params;
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";

  const signal = await getSignalById(id);
  if (!signal) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const source: Source = {
    id: createId("fg-source"),
    type: toSourceType(parsed.data.sourceType),
    title: normalizeFundgraphText(parsed.data.title || `Signal source ${signal.title}`, 240) || `Signal source ${signal.title}`,
    url: parsed.data.url,
    rawText: normalizeFundgraphText(parsed.data.snippet || parsed.data.note || "", 3000),
    createdAt: now,
    metadata: {
      signalId: signal.id,
      visibility: parsed.data.visibility,
      sourceType: parsed.data.sourceType,
    },
  };

  await addSource(source);
  const updatedSignal = await addSignalSourceCitation({
    signalId: signal.id,
    title: parsed.data.title,
    url: parsed.data.url,
    snippet: parsed.data.snippet,
    note: parsed.data.note,
  });
  const gamification = await applyContribution(userId, "add_source", `signal:${signal.id}:source:${source.id}`);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signal: updatedSignal ?? signal,
    source,
    gamification,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
