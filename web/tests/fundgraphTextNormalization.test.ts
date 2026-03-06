import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldLikeBullets,
  hasNavigationNoise,
  isLikelyBoilerplateScrapeText,
  normalizeFundgraphText,
} from "@/lib/fundgraph/textNormalization";

test("normalizeFundgraphText fixes concatenated scraped profile blocks", () => {
  const raw =
    "Subrata MitraBased InBangaloreSpecialtyFocusAI ConsumerFintech CompaniesTeamNews & InsightsCompaniesTeamNews & InsightsGlobalGlobal";
  const cleaned = normalizeFundgraphText(raw, 500);
  assert.ok(cleaned.includes("Subrata Mitra Based In Bangalore"));
  assert.ok(cleaned.includes("Focus AI Consumer Fintech"));
  assert.ok(!cleaned.includes("CompaniesTeamNews"));
});

test("fieldLikeBullets extracts readable field bullets", () => {
  const raw = "Subrata Mitra Based In Bangalore Specialty Early Stage Focus AI Consumer Fintech";
  const bullets = fieldLikeBullets(raw, 5);
  assert.ok(bullets.some((entry) => entry.startsWith("Based In: Bangalore")));
  assert.ok(bullets.some((entry) => entry.startsWith("Specialty: Early Stage")));
  assert.ok(bullets.some((entry) => entry.startsWith("Focus: AI Consumer Fintech")));
});

test("navigation noise detector flags dense nav snippets", () => {
  const nav = "Companies Team News & Insights About Portfolio People Investments Jobs Writing Search Global Filters";
  assert.equal(hasNavigationNoise(nav), true);
});

test("boilerplate detector catches address/nav scrape blobs", () => {
  const addressBlob =
    "Benchmark 140 New Montgomery Street San Francisco, California 94105 2965 Woodside Road Woodside, California 94062 More info: @benchmark All rights reserved.";
  const navBlob =
    "HOMETEAMFOunders PORTFOLIOPUBLICATIONS 01// 04 Building great companies is a craft. We know what it takes.";
  assert.equal(isLikelyBoilerplateScrapeText(addressBlob), true);
  assert.equal(isLikelyBoilerplateScrapeText(navBlob), true);
});
