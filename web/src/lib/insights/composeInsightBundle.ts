import type { TrustFields } from "@/lib/trust/schema";
import type {
  ClaimConfidence,
  CoverageSource,
  EvidenceStrength,
  EvidenceType,
  InsightBundle,
  NarrativeLens,
  OpposingArticle,
  SpeculationStatus,
  Stance,
  Tone,
  TrustDashboard,
} from "@/types/insights";
import type { Story } from "@/types/story";

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

function clamp0to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeUrl(input: string | undefined | null): string | null {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (PLACEHOLDER_HOSTS.has(parsed.hostname.replace(/^www\./, ""))) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function domainName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function inferSourceTypeFromLabel(label: string): CoverageSource["sourceType"] {
  const lowered = label.toLowerCase();
  if (lowered.includes("community")) return "community";
  if (lowered.includes("primary")) return "primary";
  if (lowered.includes("social")) return "social";
  return "editorial";
}

function asIso(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function minutesAgoFromIso(iso: string): number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 0;
  const diffMins = Math.floor((Date.now() - parsed) / 60_000);
  return Math.max(0, diffMins);
}

function detectSpeculation(title: string, summary: string): { status: SpeculationStatus; reason: string } {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes("rumor") || text.includes("rumour") || text.includes("reportedly") || text.includes("leak")) {
    return { status: "Speculative", reason: "Coverage language indicates an unconfirmed report." };
  }
  if (text.includes("could") || text.includes("might") || text.includes("possible")) {
    return { status: "Speculative", reason: "Coverage uses conditional language and uncertain outcomes." };
  }
  if (text.includes("developing") || text.includes("breaking")) {
    return { status: "Developing", reason: "Story appears to be developing and details may change." };
  }
  return { status: "Confirmed", reason: "No explicit uncertainty markers detected in the current summary." };
}

function evidenceStrengthFromSources(sources: CoverageSource[]): EvidenceStrength {
  const sourceKinds = new Set(sources.map((source) => source.sourceType));
  if (sourceKinds.has("primary") && sources.length >= 2) return "Strong";
  if (sources.length >= 2) return "Medium";
  return "Weak";
}

function extractBullets(markdown: string | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

function buildSources(story: Story, nowIso: string): CoverageSource[] {
  const list: CoverageSource[] = [];
  const seen = new Set<string>();

  const pushSource = (source: CoverageSource) => {
    const normalizedUrl = normalizeUrl(source.url);
    if (!normalizedUrl) return;
    if (seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    list.push({ ...source, url: normalizedUrl });
  };

  for (const perspective of story.perspectives ?? []) {
    pushSource({
      name: perspective.sourceName || story.sourceName,
      url: perspective.url,
      publishedAt: asIso(perspective.publishedAt, nowIso),
      sourceType: inferSourceTypeFromLabel(perspective.label),
    });
  }

  pushSource({
    name: story.sourceName || "Source",
    url: story.url,
    publishedAt: nowIso,
    sourceType: story.sourceType,
  });

  for (const citation of story.analysis?.citations ?? []) {
    const normalized = normalizeUrl(citation);
    if (!normalized) continue;
    pushSource({
      name: domainName(normalized),
      url: normalized,
      publishedAt: nowIso,
      sourceType: "editorial",
    });
  }

  return list;
}

function buildLenses(story: Story): NarrativeLens[] {
  const tags = (story.tags ?? []).slice(0, 6);
  if (story.perspectives.length) {
    return story.perspectives.slice(0, 4).map((perspective) => ({
      id: perspective.id,
      label: `${perspective.label} framing`,
      tone: perspective.tone as Tone,
      summary: perspective.summary || story.summary,
      keywords: tags.length ? tags : [perspective.label],
    }));
  }

  return [
    {
      id: `lens-${story.id}`,
      label: "Primary framing",
      tone: "Neutral",
      summary: story.summary,
      keywords: tags.length ? tags : ["coverage"],
    },
  ];
}

function buildOpposingArticles(story: Story): OpposingArticle[] {
  return (story.perspectives ?? [])
    .filter((perspective) => perspective.stance === "Skeptical" && Boolean(normalizeUrl(perspective.url)))
    .slice(0, 3)
    .map((perspective, idx) => ({
      id: `${story.id}-opp-${idx + 1}`,
      title: perspective.title || story.title,
      sourceName: perspective.sourceName || story.sourceName,
      stance: (perspective.stance || "Skeptical") as Stance,
      snippet: perspective.summary || story.summary,
      url: normalizeUrl(perspective.url) as string,
    }));
}

function buildTrustDashboard(story: Story, sources: CoverageSource[], trustFields: TrustFields | undefined, nowIso: string): TrustDashboard {
  const latestPublishedAt = [...sources]
    .map((source) => source.publishedAt)
    .sort((a, b) => (a > b ? -1 : 1))[0] ?? nowIso;
  const updatedMinsAgo = minutesAgoFromIso(latestPublishedAt);
  const sourceTypes = new Set(sources.map((source) => source.sourceType));
  const hasPrimary = sourceTypes.has("primary");
  const uniqueSourceCount = sources.length;
  const tagsCount = (story.tags ?? []).length;
  const mediaCount = sources.filter((source) => source.sourceType === "editorial").length;
  const communityCount = sources.filter((source) => source.sourceType === "community" || source.sourceType === "social").length;
  const officialCount = sources.filter((source) => source.sourceType === "primary").length;

  const relevance = clamp0to100(35 + tagsCount * 10 + (uniqueSourceCount ? 10 : 0));
  const freshness = clamp0to100(100 - Math.min(95, Math.floor(updatedMinsAgo / 45) * 5));
  const trending = clamp0to100(20 + uniqueSourceCount * 14);
  const informationGain = clamp0to100(15 + uniqueSourceCount * 18 + (hasPrimary ? 12 : 0));

  const agreement: TrustDashboard["coverage"]["agreement"] =
    uniqueSourceCount >= 4 ? "High" : uniqueSourceCount >= 2 ? "Medium" : "Low";
  const confidence: TrustDashboard["confidence"]["level"] =
    hasPrimary && uniqueSourceCount >= 2 ? "High" : uniqueSourceCount >= 2 ? "Medium" : "Low";

  const missingBullets = trustFields?.whats_missing?.filter(Boolean).slice(0, 3) ?? [];
  while (missingBullets.length < 3) {
    if (!uniqueSourceCount) missingBullets.push("No independent source links are available yet.");
    else if (!hasPrimary) missingBullets.push("No primary-source citation is available for this story.");
    else missingBullets.push("Long-term downstream effects are still uncertain.");
  }

  return {
    selection: {
      relevance,
      freshness,
      trending,
      informationGain,
    },
    framing: {
      political: 50,
      techSentiment: 50,
      powerLens: 50,
    },
    coverage: {
      independentSourceCount: uniqueSourceCount,
      mix: {
        media: mediaCount,
        community: communityCount,
        official: officialCount,
      },
      agreement,
    },
    confidence: {
      level: confidence,
      updatedAtIso: latestPublishedAt,
    },
    missing: {
      bullets: [missingBullets[0] as string, missingBullets[1] as string, missingBullets[2] as string],
    },
    provenance: {
      computedFromSources: uniqueSourceCount,
      updatedMinsAgo,
      models: {
        clustering: "heuristic-v1",
        framing: "trust-fields-v1",
        coverage: "source-mix-v1",
      },
    },
  };
}

function buildWhySeeingThis(story: Story, sources: CoverageSource[]): string[] {
  const why: string[] = [];
  const tags = story.tags ?? [];
  if (tags.length) why.push(`Tagged topics: ${tags.slice(0, 3).join(", ")}`);
  if (sources.length) why.push(`Tracked from ${sources.length} linked source${sources.length > 1 ? "s" : ""}.`);
  if (sources.some((source) => source.sourceType === "primary")) why.push("Includes at least one primary-source citation.");
  if (!why.length) why.push("Included from the current source feed.");
  return why.slice(0, 3);
}

function buildDerivedClaims(story: Story, sources: CoverageSource[], evidenceStrength: EvidenceStrength): InsightBundle["verify"]["claims"] {
  const claimLines = [
    ...extractBullets(story.analysis?.summary_markdown),
    story.summary,
  ]
    .map((line) => line.trim())
    .filter(Boolean);

  const uniqueClaimLines: string[] = [];
  const seen = new Set<string>();
  for (const line of claimLines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueClaimLines.push(line);
    if (uniqueClaimLines.length >= 3) break;
  }

  const confidence: ClaimConfidence =
    evidenceStrength === "Strong" ? "High" : evidenceStrength === "Medium" ? "Med" : "Low";
  const evidenceType: EvidenceType =
    sources.some((source) => source.sourceType === "primary")
      ? "Primary"
      : sources.some((source) => source.sourceType === "community" || source.sourceType === "social")
        ? "Social"
        : "Editorial";

  return uniqueClaimLines.map((line, idx) => ({
    id: `${story.id}-claim-${idx + 1}`,
    claimText: line,
    confidence,
    supportCount: Math.max(1, sources.length),
    evidenceType,
    evidence: sources.slice(0, 2).map((source, sourceIdx) => ({
      id: `${story.id}-claim-${idx + 1}-source-${sourceIdx + 1}`,
      snippet: line,
      sourceName: source.name,
      url: source.url,
      timestamp: source.publishedAt,
    })),
  }));
}

export function composeInsightBundle(story: Story, options?: { trustFields?: TrustFields }): InsightBundle {
  const nowIso = new Date().toISOString();
  const sources = buildSources(story, nowIso);
  const evidenceStrength = evidenceStrengthFromSources(sources);
  const speculation = detectSpeculation(story.title, story.summary);
  const trustDashboard = buildTrustDashboard(story, sources, options?.trustFields, nowIso);
  const missingSignals = trustDashboard.missing.bullets[0];

  return {
    whySeeingThis: buildWhySeeingThis(story, sources),
    biasLabel: "Mixed",
    biasNotes: story.analysis?.bias || undefined,
    speculationStatus: speculation.status,
    speculationReason: speculation.reason,
    evidenceStrength,
    missingSignals,
    sources,
    trustDashboard,
    trustFields: options?.trustFields,
    perspectives: {
      lenses: buildLenses(story),
      opposingArticles: buildOpposingArticles(story),
    },
    verify: {
      claims: buildDerivedClaims(story, sources, evidenceStrength),
    },
  };
}
