import { NextResponse } from "next/server";
import {
  ADVANCED_SIGNAL_INSIGHT_VERSION,
  evaluateAdvancedInsightCache,
} from "@/lib/fundgraph/advancedSignalInsight";
import {
  enqueueAdvancedInsightGeneration,
} from "@/lib/fundgraph/advancedInsightJobs";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { readFunds } from "@/lib/fundgraph/storage";
import { getSignalById, getSignals, setSignalAdvancedInsightState } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [signal, allSignals, funds] = await Promise.all([getSignalById(id), getSignals(), readFunds()]);
  if (!signal) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  const cacheStatus = evaluateAdvancedInsightCache({
    signal,
    allSignals,
    funds,
  });

  if (signal.advancedInsightStatus === "ready" && signal.advancedInsight && !cacheStatus.shouldRefresh) {
    return NextResponse.json({
      mode: getFundgraphDataMode(),
      signalId: signal.id,
      status: "ready",
      insight: signal.advancedInsight,
      cached: true,
      generationVersion: ADVANCED_SIGNAL_INSIGHT_VERSION,
    });
  }

  if (signal.advancedInsightStatus !== "preparing" || signal.advancedInsight || signal.advancedInsightError) {
    await setSignalAdvancedInsightState({
      signalId: signal.id,
      status: "preparing",
      clearInsight: true,
    });
  }

  const enqueued = enqueueAdvancedInsightGeneration(signal.id, {
    force: cacheStatus.shouldRefresh || signal.advancedInsightStatus === "failed",
  });

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signalId: signal.id,
    status: "preparing",
    cached: !enqueued,
    generationVersion: ADVANCED_SIGNAL_INSIGHT_VERSION,
    message: enqueued ? "analysis_preparing" : "analysis_preparing_in_progress",
  });
}
