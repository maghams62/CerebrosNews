import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeFunds } from "../scripts/fundgraphVcEnrich/canonicalize";
import { cleanupDbNoise } from "../scripts/fundgraphVcEnrich/cleanup";
import { dedupeClaims, dedupeSignalsAdvanced, sourceCandidateDedupeKey } from "../scripts/fundgraphVcEnrich/dedupe";
import { runVcEnrichment } from "../scripts/fundgraphVcEnrich";
import { titleMatchesFund } from "../scripts/fundgraphVcEnrich/sources";
import { Fund, FundgraphDbFile, NewsClaim, Signal } from "@/lib/fundgraph/types";

function mockFund(partial: Partial<Fund>): Fund {
  return {
    id: partial.id ?? "fg-fund-test-1",
    name: partial.name ?? "Test Capital",
    slug: partial.slug ?? "test-capital",
    description: partial.description ?? "desc",
    headquarters: partial.headquarters ?? "SF, US",
    geography: partial.geography ?? ["US"],
    geographies: partial.geographies ?? ["US"],
    stages: partial.stages ?? ["Seed"],
    sectors: partial.sectors ?? ["AI"],
    checkSizeMinM: partial.checkSizeMinM ?? 1,
    checkSizeMaxM: partial.checkSizeMaxM ?? 5,
    checkSizeKUsd: partial.checkSizeKUsd ?? { min: 1000, max: 5000 },
    aumM: partial.aumM ?? 120,
    vintageYear: partial.vintageYear ?? 2018,
    trendScore: partial.trendScore ?? 70,
    momentumScore: partial.momentumScore ?? 65,
    communityScore: partial.communityScore ?? 60,
    risk: partial.risk ?? "medium",
    gp: partial.gp ?? { name: "Jane Doe", title: "GP", bio: "bio" },
    gpNames: partial.gpNames ?? ["Jane Doe"],
    portfolio: partial.portfolio ?? ["Acme"],
    strategy: partial.strategy ?? "strategy",
    ...partial,
  };
}

test("canonicalizeFunds picks smallest suffix id and merges list fields", () => {
  const funds: Fund[] = [
    mockFund({
      id: "fg-fund-example-12",
      name: "Example Ventures",
      gpNames: ["Alice Smith"],
      portfolio: ["Acme", "Helios"],
    }),
    mockFund({
      id: "fg-fund-example-3",
      name: "Example Ventures",
      gpNames: ["Bob Jones"],
      portfolio: ["Helios", "Nova"],
      description: "Longer description for canonical merge quality.",
    }),
  ];

  const canonical = canonicalizeFunds(funds);
  assert.equal(canonical.funds.length, 1);
  assert.equal(canonical.funds[0]?.id, "fg-fund-example-3");
  const mergedGpNames = new Set(canonical.funds[0]?.gpNames ?? []);
  assert.ok(mergedGpNames.has("Alice Smith"));
  assert.ok(mergedGpNames.has("Bob Jones"));
  assert.deepEqual(new Set(canonical.funds[0]?.portfolio ?? []), new Set(["Acme", "Helios", "Nova"]));
  assert.equal(canonical.aliasByFundId.get("fg-fund-example-12"), "fg-fund-example-3");
});

test("dedupe keys normalize URL and merge similar claims/signals", () => {
  const keyA = sourceCandidateDedupeKey({
    id: "1",
    title: "Example",
    url: "https://example.com/path/?utm_source=test#frag",
    sourceName: "A",
    sourceType: "dataset_article",
    summary: "a",
    content: "a",
    publishedAt: "2026-03-01T00:00:00.000Z",
    tags: [],
    fundIds: ["fund-1"],
  });
  const keyB = sourceCandidateDedupeKey({
    id: "2",
    title: "Example",
    url: "https://example.com/path",
    sourceName: "A",
    sourceType: "dataset_article",
    summary: "b",
    content: "b",
    publishedAt: "2026-03-01T05:00:00.000Z",
    tags: [],
    fundIds: ["fund-1"],
  });
  assert.equal(keyA, keyB);

  const claimA: NewsClaim = {
    id: "c1",
    sourceId: "s1",
    claimText: "Example Ventures led the round.",
    category: "Funding",
    entities: ["Example Ventures"],
    llmConfidence: 0.7,
    citation: { sourceId: "s1", url: "https://example.com/a", title: "A", snippet: "led the round" },
    community: { verifyCount: 0, disagreeCount: 0, commentCount: 0, verifies: 0, disagrees: 0, trustScore: 0 },
    linkedFundIds: ["fund-1"],
    citationCount: 1,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const claimB: NewsClaim = {
    ...claimA,
    id: "c2",
    sourceId: "s2",
    citation: { sourceId: "s2", url: "https://example.com/b", title: "B", snippet: "led the round in AI" },
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
  };
  const claimDeduped = dedupeClaims([claimA, claimB]);
  assert.equal(claimDeduped.claims.length, 1);
  assert.ok((claimDeduped.claims[0]?.citationCount ?? 0) >= 2);

  const signalBase: Signal = {
    id: "sig-1",
    fundId: "fund-1",
    title: "Example: led a round",
    summary: "Signal summary",
    confidence: 0.7,
    createdAt: "2026-03-01T10:00:00.000Z",
    authorName: "system",
    upvotes: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    evidenceUrl: "https://example.com/signal",
  };
  const signalNearDuplicate: Signal = {
    ...signalBase,
    id: "sig-2",
    createdAt: "2026-03-02T02:00:00.000Z",
    confidence: 0.8,
  };
  const dedupedSignals = dedupeSignalsAdvanced([signalBase, signalNearDuplicate]);
  assert.equal(dedupedSignals.signals.length, 1);
});

test("cleanupDbNoise removes obvious test/demo noise and linked rows", () => {
  const db: FundgraphDbFile = {
    claims: [
      {
        id: "claim-1",
        sourceId: "source-test",
        claimText: "Test source claim",
        category: "Other",
        entities: [],
        llmConfidence: 0.5,
        citation: {
          sourceId: "source-test",
          url: "https://example.com/verification-test",
          title: "Test source",
          snippet: "snippet",
        },
        community: { verifyCount: 0, disagreeCount: 0, commentCount: 0, verifies: 0, disagrees: 0, trustScore: 0 },
        linkedFundIds: [],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "claim-2",
        sourceId: "source-generic",
        claimText: "GIC official website. GIC official website and firm profile.",
        category: "Other",
        entities: ["GIC"],
        llmConfidence: 0.5,
        citation: {
          sourceId: "source-generic",
          url: "https://gic.com.sg/",
          title: "GIC official website",
          snippet: "GIC official website and firm profile.",
        },
        community: { verifyCount: 0, disagreeCount: 0, commentCount: 0, verifies: 0, disagrees: 0, trustScore: 0 },
        linkedFundIds: ["fund-1"],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ],
    signals: [
      {
        id: "signal-test",
        fundId: "fund-1",
        title: "Verification API test source",
        summary: "test summary",
        confidence: 0.5,
        createdAt: "2026-03-01T00:00:00.000Z",
        authorName: "system",
        upvotes: 0,
        verifiedCount: 0,
        verifies: 0,
        disagrees: 0,
        commentsCount: 0,
        evidenceUrl: "https://example.com/x",
      },
      {
        id: "signal-generic",
        fundId: "fund-1",
        title: "GIC: GIC official website",
        summary: "GIC official website. GIC official website and firm profile.",
        confidence: 0.52,
        createdAt: "2026-03-01T00:00:00.000Z",
        authorName: "system",
        upvotes: 0,
        verifiedCount: 0,
        verifies: 0,
        disagrees: 0,
        commentsCount: 0,
        evidenceUrl: "https://gic.com.sg/",
      },
    ],
    profiles: [],
    verifications: [{ id: "v1", userId: "u1", vote: "verify", claimId: "claim-1", createdAt: "2026-03-01T00:00:00.000Z" }],
    credByUser: {},
    users: [],
    conflicts: [{ id: "co-1", claimIdA: "claim-1", claimIdB: "claim-1", status: "open", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" }],
    sources: [
      {
        id: "source-test",
        type: "NEWS_ARTICLE",
        title: "Verification API test source",
        url: "https://example.com/verification-test",
        rawText: "test",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "source-real",
        type: "NEWS_ARTICLE",
        title: "Real source",
        url: "https://news.ycombinator.com/item?id=1",
        rawText: "real",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "source-generic",
        type: "NEWS_ARTICLE",
        title: "GIC official website",
        url: "https://gic.com.sg/",
        rawText: "GIC official website and firm profile.",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ],
    claimLinks: [
      { id: "l1", claimId: "claim-1", targetType: "FUND", targetId: "fund-1", targetName: "Fund 1", score: 0.8, createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "l2", claimId: "claim-2", targetType: "FUND", targetId: "fund-1", targetName: "Fund 1", score: 0.8, createdAt: "2026-03-01T00:00:00.000Z" },
    ],
    memos: [],
    contributionEvents: [],
    signalStances: [],
  };

  const cleaned = cleanupDbNoise(db);
  assert.equal(cleaned.db.sources?.length, 1);
  assert.equal(cleaned.db.claims.length, 0);
  assert.equal(cleaned.db.claimLinks?.length, 0);
  assert.equal(cleaned.db.signals.length, 0);
});

test("integration: runVcEnrichment dry-run on subset keeps canonical fund names unique", async () => {
  const result = await runVcEnrichment({
    dryRun: true,
    offlineOnly: true,
    fundLimit: 2,
    maxClaimSources: 20,
  });

  assert.equal(result.summary.total_vc_funds_processed, 2);
  assert.ok(result.funds.length > 0);

  const seen = new Set<string>();
  for (const fund of result.funds) {
    const key = fund.name.toLowerCase().trim();
    assert.ok(!seen.has(key), `duplicate canonical fund name found: ${fund.name}`);
    seen.add(key);
  }
  assert.ok(result.summary.total_new_citations_fetched >= 0);
});

test("fund matcher uses boundary logic and avoids substring false positives", () => {
  const fund = mockFund({
    id: "fg-fund-accel-1",
    name: "Accel",
    aliases: ["Accel Partners"],
  });
  const benchmark = mockFund({
    id: "fg-fund-benchmark-4",
    name: "Benchmark",
    aliases: [],
    officialUrl: "https://benchmark.com",
  });

  assert.equal(titleMatchesFund("Accel led the Series A round for Acme", fund), true);
  assert.equal(titleMatchesFund("The company accelerates hiring across engineering teams", fund), false);
  assert.equal(
    titleMatchesFund(
      "FTSE benchmark rates moved lower as oil futures rose across markets.",
      benchmark,
      "https://www.cityam.com/ftse-100-live-oil-price-spikes-stocks-to-fall-amid-us-iran-conflict"
    ),
    false
  );
  assert.equal(
    titleMatchesFund(
      "Benchmark led the Series A financing round for startup Acme.",
      benchmark,
      "https://techcrunch.com/2026/03/05/acme-series-a"
    ),
    true
  );
  assert.equal(titleMatchesFund("Benchmarking tools saw broad adoption", benchmark), false);
});
