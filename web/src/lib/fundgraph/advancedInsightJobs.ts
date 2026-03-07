import {
  buildAdvancedSignalInsightWithQuality,
  evaluateAdvancedInsightCache,
} from "@/lib/fundgraph/advancedSignalInsight";
import { readFunds, readGraphEdges } from "@/lib/fundgraph/storage";
import { getSignalById, getSignals, setSignalAdvancedInsightState } from "@/lib/fundgraph/store";

const inFlightAdvancedInsightJobs = new Map<string, Promise<void>>();

async function generateAndPersistAdvancedInsight(signalId: string, force: boolean): Promise<void> {
  const [signal, allSignals, funds, graphEdges] = await Promise.all([
    getSignalById(signalId),
    getSignals(),
    readFunds(),
    readGraphEdges(),
  ]);
  if (!signal) return;

  if (!force && signal.advancedInsightStatus === "ready" && signal.advancedInsight) {
    const cacheStatus = evaluateAdvancedInsightCache({
      signal,
      allSignals,
      funds,
    });
    if (!cacheStatus.shouldRefresh) {
      return;
    }
  }

  await setSignalAdvancedInsightState({
    signalId,
    status: "preparing",
    clearInsight: true,
  });

  try {
    const generation = await buildAdvancedSignalInsightWithQuality({
      signal,
      allSignals,
      funds,
      graphEdges,
    });

    if (generation.status === "ready") {
      await setSignalAdvancedInsightState({
        signalId,
        status: "ready",
        insight: generation.insight,
      });
      return;
    }

    await setSignalAdvancedInsightState({
      signalId,
      status: "failed",
      clearInsight: true,
      error: generation.message,
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "generation_failed";
    await setSignalAdvancedInsightState({
      signalId,
      status: "failed",
      clearInsight: true,
      error: message,
    });
  }
}

export function enqueueAdvancedInsightGeneration(signalId: string, options?: { force?: boolean }): boolean {
  const normalizedSignalId = signalId.trim();
  if (!normalizedSignalId) return false;
  if (inFlightAdvancedInsightJobs.has(normalizedSignalId)) return false;

  const force = options?.force === true;
  const job = Promise.resolve()
    .then(() => generateAndPersistAdvancedInsight(normalizedSignalId, force))
    .finally(() => {
      inFlightAdvancedInsightJobs.delete(normalizedSignalId);
    });

  inFlightAdvancedInsightJobs.set(normalizedSignalId, job);
  return true;
}

export function isAdvancedInsightGenerationInFlight(signalId: string): boolean {
  return inFlightAdvancedInsightJobs.has(signalId.trim());
}
