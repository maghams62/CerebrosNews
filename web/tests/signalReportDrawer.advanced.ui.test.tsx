import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { FundGraphProvider } from "@/fundgraph/state";
import { signalUnlockStorageKey } from "@/lib/fundgraph/signalPaywall";
import type { AdvancedSignalInsight, Signal } from "@/lib/fundgraph/types";

type AdvancedScenario = "ready" | "preparing" | "preparing_then_ready" | "failed";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  (globalThis as { window?: Window }).window = dom.window as unknown as Window;
  (globalThis as { document?: Document }).document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { self?: unknown }).self = dom.window;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function mockSignal(signalId: string): Signal {
  return {
    id: signalId,
    fundId: "f-sequoia",
    title: "Sequoia: Workflow AI signal",
    summary: "Signal summary for testing deep analysis unlock rendering.",
    confidence: 0.71,
    createdAt: "2026-03-05T10:00:00.000Z",
    authorName: "demo",
    upvotes: 2,
    verifiedCount: 1,
    verifies: 1,
    disagrees: 0,
    commentsCount: 0,
    tags: ["ai", "workflow"],
    source: "community",
    evidenceUrl: "https://example.org/source",
    evidenceSnippet: "Evidence snippet for UI test.",
    bullishCount: 2,
    neutralCount: 0,
    bearishCount: 0,
  };
}

function mockAdvancedInsight(): AdvancedSignalInsight {
  return {
    materiality_score: 82,
    materiality_label: "high",
    novelty_score: 66,
    risk_uncertainty_score: 37,
    implication_summary: "This signal matters because it may indicate a strengthening workflow-AI pattern tied to active fund participation.",
    bull_case: "Bull case: corroboration appears quickly and this event signals a broader category acceleration.",
    base_case: "Base case: this remains useful directional context but still needs stronger multi-source confirmation.",
    bear_case: "Bear case: this is a thin single-thread datapoint and fades if conflicting disclosures emerge.",
    missing_evidence: [
      "Independent confirmation from a second reputable source.",
      "Primary-source statement from company or investor.",
    ],
    confidence_change_triggers: [
      "Confidence rises with corroborated investor and amount details.",
      "Confidence falls if source reports materially conflict.",
    ],
    entity_impact: [
      {
        entity_id: "f-sequoia",
        entity_name: "Sequoia",
        entity_type: "fund",
        impact_summary: "Reinforces ongoing exposure to workflow AI themes with moderate conviction.",
        relevance_score: 82,
      },
    ],
    related_signals: [
      {
        signal_id: "related-1",
        title: "Similar workflow AI funding signal",
        relation_type: "same_theme",
        similarity_score: 0.74,
      },
    ],
    next_questions: [
      "Which primary source can confirm investor participation?",
      "Does this match recent workflow AI funding cadence?",
      "What downstream traction signal should be monitored next?",
    ],
    graph_insight_summary: "This signal sits near a small but growing workflow AI cluster.",
    historical_context: "In the last 30 days, similar signals have increased relative to the prior 90-day baseline.",
    analyst_note: {
      summary: "Directionally important with medium uncertainty; prioritize corroboration before conviction changes.",
      bullets: [
        "Why it matters: category momentum may be strengthening.",
        "What is uncertain: corroboration remains limited.",
        "What to watch next: independent source confirmation.",
      ],
    },
    generated_at: "2026-03-05T12:00:00.000Z",
    generation_version: "advanced_v2",
  };
}

async function mountDrawer(options: { signalId: string; unlocked: boolean; scenario: AdvancedScenario; mirrorSignalUpdates?: boolean }) {
  const dom = installDom();
  const container = dom.window.document.getElementById("root");
  assert.ok(container, "expected test root container");

  const signal = mockSignal(options.signalId);
  dom.window.localStorage.setItem(
    "fundgraph_session_v3",
    JSON.stringify({
      userId: "demo",
      userName: "Demo",
      cred: 25,
      badge: "Visitor",
      contributions: 0,
      tier: "visitor",
      limits: {
        maxClaimsVisible: 20,
        maxSignalsVisible: 20,
        graphDepth: 2,
        memoAllowed: false,
        fullAccess: false,
        earlySignals: false,
      },
      shortlist: { fundIds: [], signalIds: [], themeKeys: [] },
    })
  );

  if (options.unlocked) {
    dom.window.localStorage.setItem(signalUnlockStorageKey("demo"), JSON.stringify([options.signalId]));
  }

  const originalFetch = globalThis.fetch;
  let advancedCalls = 0;
  let refreshCalls = 0;

  globalThis.fetch = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/fundgraph/user") && method === "GET") {
      return new Response(
        JSON.stringify({
          userId: "demo",
          credits: 25,
          contributions: 0,
          tier: "visitor",
          daily: { date: "2026-03-05", creditsEarned: 0, actions: { verify: 0, signal: 0, source: 0 } },
          reputation: { credScore: 0 },
          limits: {
            maxClaimsVisible: 20,
            maxSignalsVisible: 20,
            graphDepth: 2,
            memoAllowed: false,
            fullAccess: false,
            earlySignals: false,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/api/fundgraph/profile") && method === "GET") {
      return new Response(
        JSON.stringify({
          mode: "hybrid",
          userId: "demo",
          profile: null,
          cred: 25,
          user: { id: "demo", name: "Demo", credScore: 0, badgeTier: "NEW" },
          recommendations: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/api/fundgraph/user/spend") && method === "POST") {
      return new Response(
        JSON.stringify({
          userId: "demo",
          credits: 20,
          contributions: 0,
          tier: "visitor",
          daily: { date: "2026-03-05", creditsEarned: 0, actions: { verify: 0, signal: 0, source: 0 } },
          reputation: { credScore: 0 },
          limits: {
            maxClaimsVisible: 20,
            maxSignalsVisible: 20,
            graphDepth: 2,
            memoAllowed: false,
            fullAccess: false,
            earlySignals: false,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes(`/api/fundgraph/signals/${encodeURIComponent(options.signalId)}/advanced/refresh`) && method === "POST") {
      refreshCalls += 1;
      return new Response(
        JSON.stringify({
          mode: "hybrid",
          signalId: options.signalId,
          status: "preparing",
          cached: false,
          generationVersion: "advanced_v2",
          message: "analysis_refresh_enqueued",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes(`/api/fundgraph/signals/${encodeURIComponent(options.signalId)}/advanced`) && method === "GET") {
      advancedCalls += 1;
      if (options.scenario === "ready") {
        return new Response(
          JSON.stringify({
            mode: "hybrid",
            signalId: options.signalId,
            status: "ready",
            insight: mockAdvancedInsight(),
            cached: false,
            generationVersion: "advanced_v2",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (options.scenario === "failed") {
        return new Response(
          JSON.stringify({
            mode: "hybrid",
            signalId: options.signalId,
            status: "failed",
            cached: true,
            generationVersion: "advanced_v2",
            message: "quality_guard:near_template_copy",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (options.scenario === "preparing_then_ready" && advancedCalls >= 2) {
        return new Response(
          JSON.stringify({
            mode: "hybrid",
            signalId: options.signalId,
            status: "ready",
            insight: mockAdvancedInsight(),
            cached: false,
            generationVersion: "advanced_v2",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          mode: "hybrid",
          signalId: options.signalId,
          status: "preparing",
          cached: false,
          generationVersion: "advanced_v2",
          message: "analysis_preparing",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  const root = createRoot(container);
  await act(async () => {
    const drawer = options.mirrorSignalUpdates ? (
      <MirrorSignalHarness signal={signal} />
    ) : (
      <SignalReportDrawer open signal={signal} onClose={() => {}} />
    );
    root.render(<FundGraphProvider>{drawer}</FundGraphProvider>);
  });
  await wait(80);

  return {
    container,
    dom,
    getAdvancedCalls: () => advancedCalls,
    getRefreshCalls: () => refreshCalls,
    async clickButton(label: string) {
      const target = Array.from(container.querySelectorAll("button")).find((node) => (node.textContent ?? "").includes(label));
      assert.ok(target, `expected button containing text: ${label}`);
      await act(async () => {
        target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      globalThis.fetch = originalFetch;
      dom.window.close();
    },
  };
}

function MirrorSignalHarness({ signal }: { signal: Signal }) {
  const [currentSignal, setCurrentSignal] = React.useState(signal);
  return <SignalReportDrawer open signal={currentSignal} onClose={() => {}} onSignalUpdated={(next) => setCurrentSignal(next)} />;
}

test("SignalReportDrawer locked state shows unlock copy only", async () => {
  const mounted = await mountDrawer({ signalId: `ui-lock-${Date.now()}`, unlocked: false, scenario: "ready" });
  assert.match(mounted.container.textContent ?? "", /Unlock implications, scenario analysis, related patterns, and next diligence steps\./);
  assert.match(mounted.container.textContent ?? "", /Unlock Deep Signal Analysis/);
  assert.doesNotMatch(mounted.container.textContent ?? "", /Why this matters/);
  assert.doesNotMatch(mounted.container.textContent ?? "", /tokens/i);
  assert.equal(mounted.getAdvancedCalls(), 0);
  await mounted.unmount();
});

test("SignalReportDrawer unlock action reveals deep analysis immediately when generation is ready", async () => {
  const mounted = await mountDrawer({ signalId: `ui-lock-open-${Date.now()}`, unlocked: false, scenario: "ready" });
  await mounted.clickButton("Unlock Deep Signal Analysis");
  await wait(240);

  const text = mounted.container.textContent ?? "";
  assert.ok(mounted.getAdvancedCalls() >= 1);
  assert.match(text, /Why this matters/);
  assert.match(text, /Hide deep analysis/);

  await mounted.unmount();
});

test("SignalReportDrawer preparing state shows premium preparing UI and hides ready sections", async () => {
  const mounted = await mountDrawer({ signalId: `ui-preparing-${Date.now()}`, unlocked: true, scenario: "preparing" });
  await mounted.clickButton("Show deep analysis");
  await wait(120);

  const text = mounted.container.textContent ?? "";
  assert.equal(mounted.getAdvancedCalls(), 1);
  assert.match(text, /Analysis preparing/);
  assert.doesNotMatch(text, /Why this matters/);
  await mounted.unmount();
});

test("SignalReportDrawer polls preparing state and renders sections once ready", async () => {
  const mounted = await mountDrawer({ signalId: `ui-ready-${Date.now()}`, unlocked: true, scenario: "preparing_then_ready" });
  await mounted.clickButton("Show deep analysis");
  await wait(120);
  assert.match(mounted.container.textContent ?? "", /Analysis preparing/);

  await wait(4_300);
  const text = mounted.container.textContent ?? "";
  assert.ok(mounted.getAdvancedCalls() >= 2);
  assert.match(text, /Why this matters/);
  assert.match(text, /Analyst framing/);
  assert.match(text, /Risks & uncertainty/);
  assert.match(text, /Network & related patterns/);
  assert.match(text, /What to do next/);

  const methodologyDetails = Array.from(mounted.container.querySelectorAll("details")).find((node) =>
    (node.textContent ?? "").includes("Methodology & raw diagnostics")
  );
  assert.ok(methodologyDetails, "expected methodology details module");
  assert.equal(methodologyDetails.hasAttribute("open"), false);

  await mounted.unmount();
});

test("SignalReportDrawer failed state exposes retry generation", async () => {
  const mounted = await mountDrawer({ signalId: `ui-failed-${Date.now()}`, unlocked: true, scenario: "failed" });
  await mounted.clickButton("Show deep analysis");
  await wait(120);

  let text = mounted.container.textContent ?? "";
  assert.match(text, /Deep analysis generation failed/);
  assert.match(text, /Retry generation/);
  assert.equal(mounted.getRefreshCalls(), 0);

  await mounted.clickButton("Retry generation");
  await wait(80);
  assert.equal(mounted.getRefreshCalls(), 1);

  text = mounted.container.textContent ?? "";
  assert.match(text, /Analysis preparing/);

  await mounted.unmount();
});

test("SignalReportDrawer keeps deep analysis expanded when parent mirrors signal updates", async () => {
  const mounted = await mountDrawer({
    signalId: `ui-parent-sync-${Date.now()}`,
    unlocked: true,
    scenario: "ready",
    mirrorSignalUpdates: true,
  });

  await mounted.clickButton("Show deep analysis");
  await wait(200);

  const text = mounted.container.textContent ?? "";
  assert.match(text, /Why this matters/);
  assert.match(text, /Hide deep analysis/);

  await mounted.unmount();
});
