import assert from "node:assert/strict";
import test from "node:test";
import {
  citationCountForDealFact,
  dealFactByCompanyName,
  filterCitationRefsForCompany,
  isDealFactVerified,
  normalizeCitationRefs,
  normalizeDealFact,
  normalizeDealFactsForFund,
} from "@/lib/fundgraph/dealFacts";
import { Fund } from "@/lib/fundgraph/types";

test("normalizeCitationRefs drops invalid entries and deduplicates by url/title", () => {
  const refs = normalizeCitationRefs([
    {
      id: "a",
      url: "https://example.com/deal",
      title: "Deal announcement",
      origin: "synthetic",
    },
    {
      id: "b",
      url: "https://example.com/deal",
      title: "Deal announcement",
      origin: "scraped",
    },
    {
      id: "c",
      url: "",
      title: "Missing url",
      origin: "manual",
    } as never,
  ]);

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.url, "https://example.com/deal");
  assert.equal(refs[0]?.title, "Deal announcement");
});

test("normalizeDealFact computes citationCount and verified from citations", () => {
  const normalized = normalizeDealFact({
    id: "deal-1",
    fundId: "fund-1",
    companyName: "OpenAI",
    amountMinM: 3,
    amountMaxM: 6,
    confidence: 1.4,
    sourceRefs: [
      {
        id: "ref-1",
        url: "https://example.com/a",
        title: "OpenAI funding note",
        origin: "synthetic",
      },
    ],
  });

  assert.equal(citationCountForDealFact(normalized), 1);
  assert.equal(isDealFactVerified(normalized), true);
  assert.equal(normalized.confidence, 1);
});

test("deal fact normalization removes unrelated citations for the company", () => {
  const normalized = normalizeDealFact({
    id: "deal-2",
    fundId: "fund-1",
    companyName: "ElevenLabs",
    sourceRefs: [
      {
        id: "ref-unrelated",
        url: "https://example.com/quantum-pasqal-spac",
        title: "French quantum startup Pasqal to go public via SPAC",
        origin: "synthetic",
      },
      {
        id: "ref-related",
        url: "https://example.com/elevenlabs-series-b",
        title: "ElevenLabs raises new funding round",
        origin: "synthetic",
      },
    ],
  });

  assert.equal(normalized.citationCount, 1);
  assert.equal(normalized.sourceRefs.length, 1);
  assert.match(normalized.sourceRefs[0]?.title ?? "", /ElevenLabs/i);
  assert.equal(normalized.verified, true);
});

test("filterCitationRefsForCompany keeps only company-matching refs", () => {
  const filtered = filterCitationRefsForCompany("OpenAI", [
    {
      id: "ref-1",
      url: "https://example.com/openai-update",
      title: "OpenAI ships new model",
      origin: "synthetic",
    },
    {
      id: "ref-2",
      url: "https://example.com/other-company",
      title: "Other company closes funding",
      origin: "synthetic",
    },
  ]);

  assert.equal(filtered.length, 1);
  assert.match(filtered[0]?.title ?? "", /OpenAI/i);
});

test("deal fact is not verified when citationCount is zero even if input flag was true", () => {
  const normalized = normalizeDealFact({
    id: "deal-flag-only",
    fundId: "fund-1",
    companyName: "OpenAI",
    verified: true,
    sourceRefs: [],
  });

  assert.equal(normalized.citationCount, 0);
  assert.equal(normalized.verified, false);
});

test("normalizeDealFactsForFund keeps unique ids and dealFactByCompanyName resolves case-insensitively", () => {
  const fund = {
    id: "fund-1",
    portfolio: ["OpenAI", "Anthropic"],
    portfolioInvestments: [
      {
        id: "deal-openai",
        fundId: "fund-1",
        companyName: "OpenAI",
        sourceRefs: [
          {
            id: "ref-openai",
            url: "https://example.com/openai",
            title: "OpenAI round",
            origin: "synthetic",
          },
        ],
      },
      {
        id: "deal-openai",
        fundId: "fund-1",
        companyName: "OpenAI",
        sourceRefs: [],
      },
      {
        id: "",
        fundId: "",
        companyName: "Anthropic",
        sourceRefs: [],
      },
    ],
  } as Fund;

  const normalized = normalizeDealFactsForFund(fund);
  assert.equal(normalized.length, 2);

  const byCompany = dealFactByCompanyName(fund);
  assert.equal(byCompany.get("openai")?.verified, true);
  assert.equal(byCompany.get("anthropic")?.verified, false);
  assert.equal(byCompany.get("anthropic")?.citationCount, 0);
});
