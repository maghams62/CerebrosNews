import assert from "node:assert/strict";
import test from "node:test";
import { computeSignalArticleQuality } from "@/lib/fundgraph/signalArticleQuality";
import { Fund, NewsClaim, Signal, Source } from "@/lib/fundgraph/types";

function mockFund(): Fund {
  return {
    id: "fg-fund-sequoia-1",
    name: "Sequoia Capital",
    slug: "sequoia-capital",
    aliases: ["Sequoia"],
    description: "Test fund",
    headquarters: "Menlo Park, US",
    geography: ["US"],
    geographies: ["US"],
    stages: ["Seed", "Series A"],
    sectors: ["AI"],
    checkSizeMinM: 1,
    checkSizeMaxM: 10,
    checkSizeKUsd: { min: 1000, max: 10000 },
    aumM: 1000,
    vintageYear: 1972,
    trendScore: 80,
    momentumScore: 75,
    communityScore: 70,
    risk: "medium",
    gp: { name: "Jane Doe", title: "Partner", bio: "Bio" },
    gpNames: ["Jane Doe"],
    portfolio: ["Acme AI"],
    strategy: "Strategy",
  };
}

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "fg-signal-1",
    fundId: "fg-fund-sequoia-1",
    title: "Sequoia Capital: Acme AI raised a $25 million Series A round",
    summary: "Acme AI announced a $25 million Series A led by Sequoia Capital with participation from existing investors.",
    confidence: 0.79,
    createdAt: "2026-03-06T01:00:00.000Z",
    authorName: "system",
    upvotes: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    source: "system",
    evidenceUrl: "https://www.techcrunch.com/2026/03/05/acme-ai-series-a",
    evidenceSnippet: "Acme AI raised a $25 million Series A round led by Sequoia Capital.",
    tags: ["funding", "ai"],
    ...overrides,
  };
}

function mockSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "vc-src-1",
    type: "NEWS_ARTICLE",
    title: "Acme AI raises $25M Series A led by Sequoia Capital",
    url: "https://www.techcrunch.com/2026/03/05/acme-ai-series-a?utm_source=rss",
    rawText:
      "Acme AI has raised a $25 million Series A round led by Sequoia Capital. The company plans to expand its engineering team and enterprise deployment footprint in 2026.",
    createdAt: "2026-03-05T12:00:00.000Z",
    metadata: {
      sourceName: "TechCrunch",
      publishedAt: "2026-03-05T12:00:00.000Z",
    },
    ...overrides,
  };
}

function mockClaim(overrides: Partial<NewsClaim> = {}): NewsClaim {
  return {
    id: "fg-claim-1",
    sourceId: "vc-src-1",
    claimText: "Acme AI raised a $25 million Series A led by Sequoia Capital.",
    category: "Funding",
    entities: ["Acme AI", "Sequoia Capital"],
    llmConfidence: 0.82,
    citation: {
      sourceId: "vc-src-1",
      url: "https://www.techcrunch.com/2026/03/05/acme-ai-series-a",
      title: "Acme AI raises $25M Series A led by Sequoia Capital",
      snippet: "Acme AI raised a $25 million Series A round led by Sequoia Capital.",
    },
    community: {
      verifyCount: 0,
      disagreeCount: 0,
      commentCount: 0,
      verifies: 0,
      disagrees: 0,
      trustScore: 20,
    },
    linkedFundIds: ["fg-fund-sequoia-1"],
    createdAt: "2026-03-05T12:00:00.000Z",
    updatedAt: "2026-03-05T12:00:00.000Z",
    ...overrides,
  };
}

function mockAmbiguousFund(): Fund {
  return {
    ...mockFund(),
    id: "fg-fund-benchmark-4",
    name: "Benchmark",
    slug: "benchmark",
    aliases: [],
    officialUrl: "https://benchmark.com",
  };
}

test("computeSignalArticleQuality marks strongly grounded signal as ALIGNED", () => {
  const signal = mockSignal({ sourceId: "vc-src-1", claimIds: ["fg-claim-1"] });
  const result = computeSignalArticleQuality({
    signal,
    fund: mockFund(),
    source: mockSource(),
    claims: [mockClaim()],
    nowIso: "2026-03-06T02:00:00.000Z",
  });

  assert.equal(result.qualityTier, "ALIGNED");
  assert.ok(result.citationMatchScore >= 0.6);
  assert.ok(result.alignmentScore >= 0.55);
  assert.ok(result.articleSnapshot.bullets.length >= 3);
  assert.ok(result.articleSnapshot.evidenceQuotes.length >= 1);
  assert.ok(result.articleSnapshot.keyFacts.length >= 2);
});

test("computeSignalArticleQuality flags mismatched evidence as FAILED", () => {
  const signal = mockSignal({
    evidenceUrl: "https://example.com/placeholder",
    evidenceSnippet: "Generic statement not present in source.",
    sourceId: "vc-src-1",
  });
  const result = computeSignalArticleQuality({
    signal,
    fund: mockFund(),
    source: mockSource({
      title: "Unrelated macro update",
      rawText: "Federal reserve commentary discussed inflation trends and bond markets.",
    }),
    claims: [],
  });

  assert.equal(result.qualityTier, "FAILED");
  assert.ok(result.qualityReasons.includes("invalid_evidence_url") || result.qualityReasons.includes("fund_not_clearly_mentioned"));
});

test("computeSignalArticleQuality fails ambiguous fund mentions without VC context", () => {
  const signal = mockSignal({
    fundId: "fg-fund-benchmark-4",
    title: "Benchmark: global stocks dropped after oil spike",
    summary: "Benchmark moved lower as oil futures surged amid macro volatility.",
    evidenceUrl: "https://www.cityam.com/ftse-100-live-oil-price-spikes-stocks-to-fall-amid-us-iran-conflict",
    evidenceSnippet: "FTSE benchmarks fell as Brent futures jumped.",
    sourceId: "vc-src-ambiguous",
  });

  const result = computeSignalArticleQuality({
    signal,
    fund: mockAmbiguousFund(),
    source: mockSource({
      id: "vc-src-ambiguous",
      title: "FTSE 100 live: oil prices spike, stocks fall",
      url: "https://www.cityam.com/ftse-100-live-oil-price-spikes-stocks-to-fall-amid-us-iran-conflict",
      rawText:
        "FTSE 100 benchmarks fell as Brent crude and WTI futures rose. Traders focused on inflation and bond yields.",
    }),
    claims: [],
  });

  assert.equal(result.qualityTier, "FAILED");
  assert.ok(result.qualityReasons.includes("fund_mention_ambiguous"));
});
