import { FeedItem } from "@/types/feed";
import {
  ClaimConfidence,
  CoverageSource,
  EvidenceStrength,
  EvidenceType,
  InsightBundle,
  NarrativeLens,
  OpposingArticle,
  SpeculationStatus,
  Stance,
  TrustDashboard,
  Tone,
} from "@/types/insights";

function stableNumberFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(seed: number, arr: readonly T[]): T {
  return arr[seed % arr.length]!;
}

function pickMany<T>(seed: number, arr: readonly T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[(seed + i * 17) % arr.length]!);
  return Array.from(new Set(out));
}

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function minsAgo(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function guessSpeculation(title: string, summary: string, publishedAtIso: string): { status: SpeculationStatus; reason: string } {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes("rumor") || text.includes("rumour") || text.includes("leak") || text.includes("reportedly")) {
    return { status: "Speculative", reason: "Uses tentative language (rumor/leak/“reportedly”) in the write-up." };
  }
  if (text.includes("could") || text.includes("might") || text.includes("possible")) {
    return { status: "Speculative", reason: "Headline uses conditional phrasing (“could/might/possible”)." };
  }
  const d = new Date(publishedAtIso);
  if (!Number.isNaN(d.getTime())) {
    const mins = (Date.now() - d.getTime()) / 60000;
    if (mins < 90) return { status: "Developing", reason: "Very recent coverage; details may still change." };
  }
  return { status: "Confirmed", reason: "Language is more definitive and coverage is older (placeholder heuristic)." };
}

function evidenceStrengthFrom(sources: CoverageSource[]): EvidenceStrength {
  if (sources.some((s) => s.sourceType === "primary")) return "Strong";
  if (sources.length >= 3) return "Medium";
  return "Weak";
}

function stanceFromTitle(seed: number, title: string): Stance {
  const t = title.toLowerCase();
  if (t.includes("fails") || t.includes("critic") || t.includes("ban")) return "Skeptical";
  return pick(seed, ["Supportive", "Skeptical", "Neutral"] as const);
}

export function mockInsightBundle(item: FeedItem): InsightBundle {
  const seed = stableNumberFromString(item.id);

  const sources: CoverageSource[] = [
    {
      name: item.sourceName,
      url: item.url,
      publishedAt: item.publishedAt,
      sourceType: item.sourceType,
    },
  ];

  // Add a couple mocked “other coverage” sources (deterministic).
  const extraOutlets = pickMany(seed, ["TechCrunch", "Wired", "The Verge", "Ars Technica", "VentureBeat", "Hacker News"], 3)
    .filter((n) => n !== item.sourceName)
    .slice(0, 2);

  for (let i = 0; i < extraOutlets.length; i++) {
    const name = extraOutlets[i]!;
    sources.push({
      name,
      url: name === "Hacker News" ? "https://news.ycombinator.com/" : "https://example.com/",
      publishedAt: new Date(Date.now() - (30 + i * 40) * 60000).toISOString(),
      sourceType: name === "Hacker News" ? "community" : "editorial",
    });
  }

  const { status: speculationStatus, reason: speculationReason } = guessSpeculation(item.title, item.summary, item.publishedAt);
  const evidenceStrength = evidenceStrengthFrom(sources);

  const biasLabel = pick(seed, ["Left", "Center", "Right", "Mixed"] as const);

  const whySeeingThis = pickMany(seed, ["Trending across sources", "Matches topics you read", "High engagement this hour", "Breaking / fresh coverage"], 2);

  const tones: Tone[] = ["Optimistic", "Skeptical", "Neutral"];
  const keywords = pickMany(seed, ["policy", "market", "privacy", "AI", "safety", "growth", "regulation", "open-source"], 5);

  const lenses: NarrativeLens[] = [
    {
      id: "media",
      label: "Media framing",
      tone: pick(seed + 1, tones),
      summary: "Focuses on the headline impact and what changes immediately for readers.",
      keywords: keywords.slice(0, 4),
    },
    {
      id: "community",
      label: "Community framing",
      tone: pick(seed + 2, tones),
      summary: "Highlights debate, tradeoffs, and second-order effects discussed by practitioners.",
      keywords: keywords.slice(1, 5),
    },
    {
      id: "primary",
      label: "Primary source framing",
      tone: "Neutral",
      summary: "Summarizes the most concrete facts, definitions, and what is explicitly claimed.",
      keywords: keywords.slice(0, 3),
    },
  ];

  const opposingArticles: OpposingArticle[] = [
    {
      id: `${item.id}-opp-1`,
      title: "A counterpoint: what the headline leaves out",
      sourceName: pick(seed + 9, ["Wired", "The Verge", "Ars Technica", "VentureBeat"] as const),
      stance: stanceFromTitle(seed + 7, item.title) as Stance,
      snippet: "An alternate take emphasizing risks, uncertainty, and potential downsides.",
      url: "https://example.com/",
    },
    {
      id: `${item.id}-opp-2`,
      title: "Why this may be overhyped (for now)",
      sourceName: pick(seed + 10, ["TechCrunch", "Wired", "The Verge", "Hacker News"] as const),
      stance: "Skeptical" as Stance,
      snippet: "A skeptical framing questioning assumptions and asking for stronger evidence.",
      url: "https://example.com/",
    },
  ].slice(0, pick(seed, [1, 2]) as number);

  const confidence: ClaimConfidence[] = ["High", "Med", "Low"];
  const evidenceTypes: EvidenceType[] = ["Primary", "Editorial", "Social"];

  const claims = Array.from({ length: pick(seed, [3, 4, 5]) as number }).map((_, idx) => {
    const cSeed = seed + idx * 31;
    const evidenceType = pick(cSeed, evidenceTypes);
    const conf = pick(cSeed + 1, confidence);
    const supportCount = pick(cSeed + 2, [1, 2, 3, 4]);
    return {
      id: `${item.id}-claim-${idx + 1}`,
      claimText: pick(
        cSeed,
        [
          "The change will materially affect users within weeks.",
          "Multiple sources agree on the core facts, but details differ.",
          "The cited numbers depend on assumptions not stated in the headline.",
          "The outcome hinges on regulatory interpretation.",
          "The reported timeline may shift as more data emerges.",
        ]
      ),
      confidence: conf,
      supportCount,
      evidenceType,
      evidence: [
        {
          id: `${item.id}-ev-${idx + 1}-a`,
          snippet: "A source excerpt supporting (or challenging) the claim with a concrete detail.",
          sourceName: sources[0]!.name,
          url: sources[0]!.url,
          timestamp: sources[0]!.publishedAt,
        },
        {
          id: `${item.id}-ev-${idx + 1}-b`,
          snippet: "Another excerpt providing context, scope, or a caveat relevant to the claim.",
          sourceName: sources[Math.min(1, sources.length - 1)]!.name,
          url: sources[Math.min(1, sources.length - 1)]!.url,
          timestamp: sources[Math.min(1, sources.length - 1)]!.publishedAt,
        },
      ],
    };
  });

  const mediaCount = sources.filter((s) => s.sourceType === "editorial").length;
  const communityCount = sources.filter((s) => s.sourceType === "community").length;
  const officialCount = sources.filter((s) => s.sourceType === "primary").length;
  const computedFromSources = sources.length;

  const updatedAtIso = new Date().toISOString();
  const updatedMinsAgo = minsAgo(updatedAtIso);

  const trustDashboard: TrustDashboard = {
    selection: {
      relevance: clamp0to100(55 + (seed % 40)),
      freshness: clamp0to100(40 + ((seed >> 2) % 55)),
      trending: clamp0to100(35 + ((seed >> 3) % 60)),
      informationGain: clamp0to100(30 + ((seed >> 4) % 65)),
    },
    framing: {
      political: clamp0to100(seed % 101),
      techSentiment: clamp0to100((seed >> 1) % 101),
      powerLens: clamp0to100((seed >> 5) % 101),
    },
    coverage: {
      independentSourceCount: computedFromSources,
      mix: {
        media: mediaCount,
        community: communityCount,
        official: officialCount,
      },
      agreement: computedFromSources >= 6 ? "High" : computedFromSources >= 3 ? "Medium" : "Low",
    },
    confidence: {
      level:
        computedFromSources >= 6 && officialCount > 0
          ? "High"
          : computedFromSources < 3
            ? "Low"
            : "Medium",
      updatedAtIso,
    },
    missing: {
      bullets: [
        "Missing stakeholder: impacted users/workers",
        "Missing data: primary metrics or documents",
        "Missing context: timeline and scope details",
      ],
    },
    provenance: {
      computedFromSources,
      updatedMinsAgo,
      models: { clustering: "v1", framing: "v1", coverage: "v1" },
    },
    vestedInterestHint: seed % 7 === 0,
  };

  return {
    whySeeingThis,
    biasLabel,
    biasNotes: "Bias is mocked per cluster/source; will be replaced by real stance modeling.",
    speculationStatus,
    speculationReason,
    evidenceStrength,
    missingSignals:
      evidenceStrength === "Strong"
        ? "No missing signals detected (mock)."
        : evidenceStrength === "Medium"
          ? "No primary source found yet."
          : "Limited cross-source confirmation so far.",
    sources,
    trustDashboard,
    perspectives: { lenses, opposingArticles },
    verify: { claims },
  };
}

