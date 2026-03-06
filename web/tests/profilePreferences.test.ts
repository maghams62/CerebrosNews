import assert from "node:assert/strict";
import test from "node:test";
import { claimMatchesUserProfile, fundMatchesUserProfile, listProfileFilterChips, normalizeUserProfileInput, profileHasActiveSignalFeedFilters, signalMatchesUserProfile } from "@/fundgraph/profilePreferences";
import { Fund, NewsClaim, Signal, UserProfile } from "@/lib/fundgraph/types";

function makeFund(overrides: Partial<Fund>): Fund {
  return {
    id: "fund-1",
    name: "Fund One",
    slug: "fund-one",
    description: "Test fund",
    headquarters: "San Francisco",
    geography: ["US"],
    geographies: ["US"],
    stages: ["Seed"],
    sectors: ["AI"],
    checkSizeMinM: 1,
    checkSizeMaxM: 5,
    checkSizeKUsd: { min: 1000, max: 5000 },
    aumM: 500,
    vintageYear: 2018,
    trendScore: 80,
    momentumScore: 72,
    communityScore: 68,
    risk: "medium",
    gp: { name: "Test GP", title: "Partner", bio: "Bio" },
    gpNames: ["Test GP"],
    portfolio: [],
    strategy: "Test strategy",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile>): UserProfile {
  return normalizeUserProfileInput(
    {
      userId: "lp-1",
      sectorFocus: [],
      stageFocus: [],
      geographies: [],
      geographyFocus: [],
      riskTolerance: "medium",
      checkSizeMinM: 0.5,
      checkSizeMaxM: 10,
      typicalCheckSizeM: 1,
      thesisKeywords: [],
      ...overrides,
    },
    "lp-1"
  );
}

test("default normalized profile does not activate feed filters", () => {
  const profile = makeProfile({});
  assert.equal(profileHasActiveSignalFeedFilters(profile), false);
  assert.equal(listProfileFilterChips(profile).length, 0);
});

test("fund matching respects sector/stage/geography preferences", () => {
  const profile = makeProfile({
    sectorFocus: ["AI", "Cloud"],
    stageFocus: ["Seed"],
    geographies: ["US"],
  });
  const matchingFund = makeFund({});
  const nonMatchingFund = makeFund({
    id: "fund-2",
    sectors: ["Fintech"],
    geographies: ["Europe"],
    geography: ["Europe"],
  });

  assert.equal(profileHasActiveSignalFeedFilters(profile), true);
  assert.equal(fundMatchesUserProfile(matchingFund, profile), true);
  assert.equal(fundMatchesUserProfile(nonMatchingFund, profile), false);
});

test("fund matching applies low/high risk and check range constraints when configured", () => {
  const lowRiskProfile = makeProfile({
    sectorFocus: ["AI"],
    riskTolerance: "low",
    checkSizeMinM: 0.5,
    checkSizeMaxM: 2,
  });
  const highRiskFund = makeFund({
    risk: "high",
    checkSizeMinM: 3,
    checkSizeMaxM: 8,
    checkSizeKUsd: { min: 3000, max: 8000 },
  });
  const lowRiskFund = makeFund({
    risk: "low",
    checkSizeMinM: 1,
    checkSizeMaxM: 2,
    checkSizeKUsd: { min: 1000, max: 2000 },
  });

  assert.equal(fundMatchesUserProfile(highRiskFund, lowRiskProfile), false);
  assert.equal(fundMatchesUserProfile(lowRiskFund, lowRiskProfile), true);
});

test("signal and claim matching resolve profile fit by linked fund ids", () => {
  const profile = makeProfile({
    sectorFocus: ["AI"],
    geographies: ["US"],
  });
  const fundById = {
    "fund-1": makeFund({ id: "fund-1", sectors: ["AI"], geographies: ["US"], geography: ["US"] }),
    "fund-2": makeFund({ id: "fund-2", sectors: ["Web3"], geographies: ["Europe"], geography: ["Europe"] }),
  };

  const matchingSignal = {
    id: "signal-1",
    fundId: "fund-1",
    title: "AI demand up",
    summary: "Summary",
    confidence: 0.8,
    createdAt: new Date().toISOString(),
    authorName: "Analyst",
    upvotes: 0,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
  } satisfies Signal;

  const nonMatchingSignal = { ...matchingSignal, id: "signal-2", fundId: "fund-2" } satisfies Signal;

  const matchingClaim = {
    id: "claim-1",
    sourceId: "source-1",
    claimText: "AI valuation reset",
    category: "Market",
    entities: ["AI"],
    llmConfidence: 0.7,
    citation: {
      sourceId: "source-1",
      url: "https://example.com",
      title: "Example",
      snippet: "Snippet",
    },
    community: {
      verifyCount: 0,
      disagreeCount: 0,
      commentCount: 0,
      verifies: 0,
      disagrees: 0,
      trustScore: 0,
    },
    linkedFundIds: ["fund-1"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies NewsClaim;

  const nonMatchingClaim = { ...matchingClaim, id: "claim-2", linkedFundIds: ["fund-2"] } satisfies NewsClaim;

  assert.equal(signalMatchesUserProfile(matchingSignal, fundById, profile), true);
  assert.equal(signalMatchesUserProfile(nonMatchingSignal, fundById, profile), false);
  assert.equal(claimMatchesUserProfile(matchingClaim, fundById, profile), true);
  assert.equal(claimMatchesUserProfile(nonMatchingClaim, fundById, profile), false);
});
