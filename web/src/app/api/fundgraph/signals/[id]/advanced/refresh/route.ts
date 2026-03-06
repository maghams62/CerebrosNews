import { NextResponse } from "next/server";
import { ADVANCED_SIGNAL_INSIGHT_VERSION } from "@/lib/fundgraph/advancedSignalInsight";
import { enqueueAdvancedInsightGeneration } from "@/lib/fundgraph/advancedInsightJobs";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getSignalById, setSignalAdvancedInsightState } from "@/lib/fundgraph/store";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const signal = await getSignalById(id);
  if (!signal) {
    return NextResponse.json({ error: "signal_not_found" }, { status: 404 });
  }

  await setSignalAdvancedInsightState({
    signalId: signal.id,
    status: "preparing",
    clearInsight: true,
  });

  const enqueued = enqueueAdvancedInsightGeneration(signal.id, { force: true });

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    signalId: signal.id,
    status: "preparing",
    cached: !enqueued,
    generationVersion: ADVANCED_SIGNAL_INSIGHT_VERSION,
    message: enqueued ? "analysis_refresh_enqueued" : "analysis_preparing_in_progress",
  });
}
