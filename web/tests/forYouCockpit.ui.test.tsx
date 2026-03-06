import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfidenceMoversPanel } from "../src/components/fundgraph/ConfidenceMoversPanel";
import { ForYouPage } from "../src/components/fundgraph/ForYouPage";
import { MarketDriversPanel } from "../src/components/fundgraph/MarketDriversPanel";
import { NetworkPulseCard } from "../src/components/fundgraph/NetworkPulseCard";
import { TrendingFundsGrid } from "../src/components/fundgraph/TrendingFundsGrid";
import { TrendingNewsPanel } from "../src/components/fundgraph/TrendingNewsPanel";
import { FundGraphProvider } from "../src/fundgraph/state";
import type {
  ConfidenceMoverRow,
  MarketDriverItem,
  NetworkPulseSnapshot,
  TrendingFundItem,
  TrendingNewsItem,
} from "../src/components/fundgraph/forYouTypes";
import type { Fund, NewsClaim, Signal } from "../src/fundgraph/types";

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length ?? 0;
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  (globalThis as { window?: Window }).window = dom.window as unknown as Window;
  (globalThis as { document?: Document }).document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { self?: unknown }).self = dom.window;
  (globalThis as { requestIdleCallback?: (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => number }).requestIdleCallback = (
    cb
  ) =>
    setTimeout(() => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
    }, 0) as unknown as number;
  (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback = (id) => clearTimeout(id);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mount(element: React.ReactElement) {
  const dom = installDom();
  const container = dom.window.document.getElementById("root");
  assert.ok(container, "expected test root container");
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    dom,
    container,
    async clickByText(text: string) {
      const target = Array.from(container.querySelectorAll("button")).find((node) => (node.textContent ?? "").includes(text));
      assert.ok(target, `expected button containing text: ${text}`);
      await act(async () => {
        target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      dom.window.close();
    },
  };
}

function buildFund(index: number): Fund {
  return {
    id: `fund-${index}`,
    name: `Fund ${index}`,
    slug: `fund-${index}`,
    description: "Synthetic fixture fund",
    headquarters: index % 2 ? "San Francisco" : "New York",
    geography: ["US"],
    geographies: ["US"],
    stages: [index % 2 ? "Seed" : "Series A"],
    sectors: index % 2 ? ["AI", "Developer Tools"] : ["Security", "Enterprise"],
    checkSizeMinM: 0.5,
    checkSizeMaxM: 3,
    checkSizeKUsd: { min: 500, max: 3000 },
    aumM: 100 + index * 20,
    vintageYear: 2022 + (index % 3),
    trendScore: 60 + index,
    momentumScore: 55 + index,
    communityScore: 64,
    risk: "medium",
    gp: {
      name: `Partner ${index}`,
      title: "General Partner",
      bio: "Sector operator turned investor",
      previousFirms: ["Example Capital"],
      focusAreas: ["AI Infrastructure"],
    },
    gpNames: [`Partner ${index}`],
    portfolio: [`Company ${index}`],
    strategy: "Seed and Series A AI infrastructure",
    fundType: "AI Seed Fund",
    portfolioMetrics: {
      portfolioSize: 20 + index,
      leadInvestmentRate: 60,
      followOnRate: 48,
    },
    coInvestors: ["CoInvest Alpha"],
    founders: ["Founder Example"],
  };
}

function buildSignal(index: number, fundId: string, createdAt: string, options?: Partial<Signal>): Signal {
  return {
    id: `signal-${index}`,
    fundId,
    title: `Signal ${index} AI infrastructure momentum`,
    summary: "Portfolio hiring and partner commentary point to increasing AI infra demand.",
    confidence: 0.58 + ((index % 4) * 0.08),
    createdAt,
    authorName: "Desk Analyst",
    upvotes: 4 + index,
    verifiedCount: 3 + index,
    verifies: 3 + index,
    disagrees: index % 3,
    commentsCount: 2,
    tags: [index % 2 ? "ai_infra" : "security", "market_drivers"],
    ...options,
  };
}

function buildClaim(index: number, createdAt: string, linkedFundIds: string[], options?: Partial<NewsClaim>): NewsClaim {
  return {
    id: `claim-${index}`,
    sourceId: `source-${index}`,
    claimText: index % 2 ? "AI infrastructure demand accelerated this week" : "Security budgets are being contested by buyers",
    category: "Market",
    entities: ["AI", "Infrastructure"],
    llmConfidence: 0.7,
    citation: {
      sourceId: `source-${index}`,
      url: `https://example.com/${index}`,
      title: `Source ${index}`,
      snippet: `Snippet ${index}`,
    },
    community: {
      verifyCount: 4,
      disagreeCount: index % 3,
      commentCount: 1,
      verifies: 4,
      disagrees: index % 3,
      trustScore: 0.6,
      verifiedCount: 4,
      disputedCount: index % 3,
    },
    linkedFundIds,
    createdAt,
    updatedAt: createdAt,
    ...options,
  };
}

test("component defaults are sparse and View all expands hidden rows/cards", async () => {
  const driverItems: MarketDriverItem[] = Array.from({ length: 8 }, (_, index) => ({
    slug: `driver-${index}`,
    title: `Driver ${index}`,
    direction: index % 2 ? "up" : "down",
    delta: index - 3,
    supportCount: 10 + index,
    contestedCount: index % 3,
    avgConfidence: 0.72,
    driverScore: 0.65,
    href: `/fundgraph/narratives/driver-${index}`,
  }));

  const newsItems: TrendingNewsItem[] = Array.from({ length: 9 }, (_, index) => ({
    id: `news-${index}`,
    title: `News item ${index}`,
    sourceTitle: `Source ${index}`,
    snippet: `Snippet ${index}`,
    createdAt: "2026-03-05T12:00:00.000Z",
    score: 0.7,
    trustWeight: 0.75,
    watchlistOverlapWeight: index % 2 ? 0.5 : 0,
    href: `/fundgraph/graph?claimId=news-${index}`,
  }));

  const funds = Array.from({ length: 7 }, (_, index) => buildFund(index + 1));
  const fundItems: TrendingFundItem[] = funds.map((fund, index) => ({
    fund,
    trendDelta: index - 2,
    topDrivers: [
      { id: `${fund.id}-d1`, text: "AI infra hiring growth", href: `/fundgraph/signals#signal-${fund.id}` },
      { id: `${fund.id}-d2`, text: "Founder referral velocity", href: `/fundgraph/signals#signal-${fund.id}-b` },
    ],
    tags: ["AI", "Seed", "US"],
    hiddenTagCount: 0,
    relatedClaims: [],
  }));

  const drivers = await mount(<MarketDriversPanel items={driverItems} />);
  assert.equal(drivers.container.querySelectorAll("a").length, 5);
  await drivers.clickByText("View all");
  assert.equal(drivers.container.querySelectorAll("a").length, 8);
  await drivers.unmount();

  const news = await mount(<TrendingNewsPanel items={newsItems} />);
  assert.equal(news.container.querySelectorAll("a").length, 6);
  await news.clickByText("View all");
  assert.equal(news.container.querySelectorAll("a").length, 9);
  await news.unmount();

  const fundGrid = await mount(<TrendingFundsGrid items={fundItems} />);
  assert.equal(fundGrid.container.querySelectorAll("article").length, 4);
  await fundGrid.clickByText("View all");
  assert.equal(fundGrid.container.querySelectorAll("article").length, 7);
  await fundGrid.unmount();
});

test("network pulse renders key metrics and graph expansion target", () => {
  const snapshot: NetworkPulseSnapshot = {
    newStrongLinks24h: 9,
    contestedLinks72h: 3,
    bridgeDriver: "AI infrastructure buildout",
    topEdgeSnippets: [
      { id: "edge-1", text: "Fund A -> Company X", href: "/fundgraph/signals#signal-1", tone: "positive" },
      { id: "edge-2", text: "Fund B -> Company Y", href: "/fundgraph/signals#signal-2", tone: "warning" },
      { id: "edge-3", text: "Fund C -> Company Z", href: "/fundgraph/signals#signal-3", tone: "neutral" },
    ],
    expandHref: "/fundgraph/graph?fundId=fund-1",
  };

  const html = renderToStaticMarkup(<NetworkPulseCard snapshot={snapshot} />);
  assert.match(html, /Strong links 24h/);
  assert.match(html, /Contested 72h/);
  assert.match(html, /AI infrastructure buildout/);
  assert.match(html, /href="\/fundgraph\/graph\?fundId=fund-1"/);
});

test("confidence movers keep a single compact confidence badge without duplicate confidence lines", () => {
  const rows: ConfidenceMoverRow[] = Array.from({ length: 8 }, (_, index) => ({
    id: `mover-${index}`,
    title: `Mover ${index}`,
    fundName: `Fund ${index}`,
    delta: index % 2 ? 14 - index : -12 + index,
    direction: index % 2 ? "up" : "down",
    confidence: index % 3 ? "Medium" : "High",
    href: `/fundgraph/signals#signal-mover-${index}`,
  }));

  const html = renderToStaticMarkup(<ConfidenceMoversPanel rows={rows} />);
  assert.equal(countMatches(html, /href="\/fundgraph\/signals#signal-mover-/g), 6);
  assert.equal(countMatches(html, /Medium confidence|High confidence|Low confidence/g), 0);
});

test("For You page renders from local data and exposes narrative/signal/claim/graph links", () => {
  const funds = [buildFund(1), buildFund(2), buildFund(3), buildFund(4)];
  const signals: Signal[] = [
    buildSignal(1, funds[0]!.id, "2026-03-05T11:45:00.000Z", { confidence: 0.84, verifiedCount: 9, verifies: 9, disagrees: 1 }),
    buildSignal(2, funds[1]!.id, "2026-03-05T10:30:00.000Z", { confidence: 0.48, verifiedCount: 2, verifies: 2, disagrees: 5 }),
    buildSignal(3, funds[2]!.id, "2026-03-05T08:00:00.000Z", { confidence: 0.74, verifiedCount: 6, verifies: 6, disagrees: 2 }),
    buildSignal(4, funds[0]!.id, "2026-03-04T18:00:00.000Z", { confidence: 0.78, verifiedCount: 7, verifies: 7, disagrees: 1 }),
    buildSignal(5, funds[3]!.id, "2026-03-04T03:00:00.000Z", { confidence: 0.66, verifiedCount: 5, verifies: 5, disagrees: 3 }),
  ];

  const claims: NewsClaim[] = [
    buildClaim(1, "2026-03-05T11:50:00.000Z", [funds[0]!.id], {
      claimText: "AI infra demand accelerated with strong enterprise pull",
      community: {
        verifyCount: 6,
        disagreeCount: 1,
        commentCount: 1,
        verifies: 6,
        disagrees: 1,
        trustScore: 0.82,
        verifiedCount: 6,
        disputedCount: 1,
      },
    }),
    buildClaim(2, "2026-03-05T09:00:00.000Z", [funds[1]!.id], {
      claimText: "Security software pricing pressure is increasing",
      community: {
        verifyCount: 2,
        disagreeCount: 4,
        commentCount: 2,
        verifies: 2,
        disagrees: 4,
        trustScore: 0.44,
        verifiedCount: 2,
        disputedCount: 4,
      },
    }),
    buildClaim(3, "2026-03-04T22:00:00.000Z", [funds[2]!.id]),
    buildClaim(4, "2026-03-04T15:00:00.000Z", [funds[0]!.id, funds[3]!.id]),
  ];

  const recommendations = [
    { fund: funds[0]!, score: 93, reason: "Top overlap with tracked AI infra themes" },
    { fund: funds[1]!, score: 81, reason: "Confidence shift matters for your watchlist" },
    { fund: funds[2]!, score: 77, reason: "Strong narrative momentum in your sectors" },
  ];

  const html = renderToStaticMarkup(
    <FundGraphProvider>
      <ForYouPage
        funds={funds}
        signals={signals}
        claims={claims}
        recommendations={recommendations}
        referenceNowMs={Date.parse("2026-03-06T12:00:00.000Z")}
        onOpenCreditsGuide={() => {}}
      />
    </FundGraphProvider>
  );

  assert.match(html, /Decision cockpit/);
  assert.match(html, /Emerging opportunities/);
  assert.match(html, /href="\/fundgraph\/signals\?signalId=.*#signal-/);
  assert.match(html, /href="\/fundgraph\/graph\?q=/);
  assert.doesNotMatch(html, /href="\/fundgraph\/graph"/);
  assert.match(html, /href="\/fundgraph\/signals\?signalId=.*quickAction=addCitation#signal-/);
});
