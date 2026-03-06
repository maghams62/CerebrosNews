import assert from "node:assert/strict";
import test from "node:test";
import { GET as getSignalAdvancedRoute } from "@/app/api/fundgraph/signals/[id]/advanced/route";
import { POST as refreshSignalAdvancedRoute } from "@/app/api/fundgraph/signals/[id]/advanced/refresh/route";
import {
  ADVANCED_SIGNAL_INSIGHT_VERSION,
  buildAdvancedSignalInsight,
} from "@/lib/fundgraph/advancedSignalInsight";
import { readFunds, readGraphEdges } from "@/lib/fundgraph/storage";
import {
  addSignal,
  getSignalById,
  getSignals,
  setSignalAdvancedInsight,
  setSignalAdvancedInsightState,
} from "@/lib/fundgraph/store";
import { Signal } from "@/lib/fundgraph/types";

function testSignal(signalId: string): Signal {
  return {
    id: signalId,
    fundId: "f-sequoia",
    title: `Sequoia backs workflow AI startup ${signalId}`,
    summary: `Sequoia participated in an early workflow AI funding round with limited corroboration so far. ${signalId}`,
    confidence: 0.68,
    createdAt: new Date().toISOString(),
    authorName: "test-user",
    upvotes: 1,
    verifiedCount: 0,
    verifies: 0,
    disagrees: 0,
    commentsCount: 0,
    tags: ["ai", "workflow", "fundraise"],
    bullishCount: 1,
    neutralCount: 0,
    bearishCount: 0,
    source: "community",
    evidenceUrl: `https://example.org/source/${encodeURIComponent(signalId)}`,
    evidenceSnippet: `Example citation snippet for advanced insight API tests. ${signalId}`,
  };
}

function uniqueSignalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function waitForSignalAdvancedStatus(
  signalId: string,
  status: "preparing" | "ready" | "failed",
  attempts = 40,
  sleepMs = 40
): Promise<Signal> {
  for (let i = 0; i < attempts; i += 1) {
    const signal = await getSignalById(signalId);
    if (signal && signal.advancedInsightStatus === status) {
      return signal;
    }
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  const latest = await getSignalById(signalId);
  assert.ok(latest, "expected signal to exist while waiting for advanced status");
  throw new Error(`timed out waiting for status ${status}; latest=${latest.advancedInsightStatus ?? "undefined"}`);
}

test("GET /api/fundgraph/signals/[id]/advanced returns 404 for missing signal", async () => {
  const res = await getSignalAdvancedRoute(new Request("http://localhost/api/fundgraph/signals/missing/advanced"), {
    params: Promise.resolve({ id: uniqueSignalId("missing-signal") }),
  });

  assert.equal(res.status, 404);
  const payload = (await res.json()) as { error?: string };
  assert.equal(payload.error, "signal_not_found");
});

test("POST /api/fundgraph/signals/[id]/advanced/refresh returns 404 for missing signal", async () => {
  const res = await refreshSignalAdvancedRoute(new Request("http://localhost/api/fundgraph/signals/missing/advanced/refresh", {
    method: "POST",
  }), {
    params: Promise.resolve({ id: uniqueSignalId("missing-refresh-signal") }),
  });

  assert.equal(res.status, 404);
  const payload = (await res.json()) as { error?: string };
  assert.equal(payload.error, "signal_not_found");
});

test("GET /api/fundgraph/signals/[id]/advanced returns cached ready insight when fresh", async () => {
  const signalId = uniqueSignalId("cached-advanced");
  const signal = await addSignal(testSignal(signalId));
  const [allSignals, funds, graphEdges] = await Promise.all([getSignals(), readFunds(), readGraphEdges()]);

  const insight = await buildAdvancedSignalInsight({
    signal,
    allSignals,
    funds,
    graphEdges,
    now: new Date(),
  });

  await setSignalAdvancedInsight({ signalId, insight });

  const res = await getSignalAdvancedRoute(new Request(`http://localhost/api/fundgraph/signals/${signalId}/advanced`), {
    params: Promise.resolve({ id: signalId }),
  });

  assert.equal(res.status, 200);
  const payload = (await res.json()) as {
    signalId: string;
    status: "ready" | "preparing" | "failed";
    cached: boolean;
    generationVersion: string;
    insight?: { generation_version?: string };
  };

  assert.equal(payload.signalId, signalId);
  assert.equal(payload.status, "ready");
  assert.equal(payload.cached, true);
  assert.equal(payload.generationVersion, ADVANCED_SIGNAL_INSIGHT_VERSION);
  assert.equal(payload.insight?.generation_version, ADVANCED_SIGNAL_INSIGHT_VERSION);
});

test("GET /api/fundgraph/signals/[id]/advanced returns preparing then deterministic-ready when LLM is unavailable", async () => {
  const signalId = uniqueSignalId("async-prepare");
  await addSignal(testSignal(signalId));

  const prevFlag = process.env.FUNDGRAPH_ADVANCED_USE_LLM;
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.FUNDGRAPH_ADVANCED_USE_LLM;
  delete process.env.OPENAI_API_KEY;

  try {
    const initial = await getSignalAdvancedRoute(new Request(`http://localhost/api/fundgraph/signals/${signalId}/advanced`), {
      params: Promise.resolve({ id: signalId }),
    });

    assert.equal(initial.status, 200);
    const initialPayload = (await initial.json()) as {
      status: "ready" | "preparing" | "failed";
      cached: boolean;
      insight?: unknown;
      message?: string;
    };
    assert.equal(initialPayload.status, "preparing");
    assert.equal(typeof initialPayload.message, "string");
    assert.equal(initialPayload.insight, undefined);

    await waitForSignalAdvancedStatus(signalId, "ready");

    const terminal = await getSignalAdvancedRoute(new Request(`http://localhost/api/fundgraph/signals/${signalId}/advanced`), {
      params: Promise.resolve({ id: signalId }),
    });
    const terminalPayload = (await terminal.json()) as {
      status: "ready" | "preparing" | "failed";
      cached: boolean;
      insight?: unknown;
    };

    assert.equal(terminalPayload.status, "ready");
    assert.equal(terminalPayload.cached, true);
    assert.ok(terminalPayload.insight);
  } finally {
    if (prevFlag === undefined) delete process.env.FUNDGRAPH_ADVANCED_USE_LLM;
    else process.env.FUNDGRAPH_ADVANCED_USE_LLM = prevFlag;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }
});

test("POST /api/fundgraph/signals/[id]/advanced/refresh enqueues regeneration and returns preparing", async () => {
  const signalId = uniqueSignalId("refresh-advanced");
  await addSignal(testSignal(signalId));
  await setSignalAdvancedInsightState({
    signalId,
    status: "failed",
    clearInsight: true,
    error: "forced_previous_failure",
  });

  const res = await refreshSignalAdvancedRoute(new Request(`http://localhost/api/fundgraph/signals/${signalId}/advanced/refresh`, {
    method: "POST",
  }), {
    params: Promise.resolve({ id: signalId }),
  });

  assert.equal(res.status, 200);
  const payload = (await res.json()) as {
    signalId: string;
    status: "ready" | "preparing" | "failed";
    generationVersion: string;
    message?: string;
  };

  assert.equal(payload.signalId, signalId);
  assert.equal(payload.status, "preparing");
  assert.equal(payload.generationVersion, ADVANCED_SIGNAL_INSIGHT_VERSION);
  assert.equal(typeof payload.message, "string");
});
