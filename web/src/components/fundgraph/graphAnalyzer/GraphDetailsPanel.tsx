"use client";

import { useMemo } from "react";
import {
  buildPresetVerifiedMetrics,
  DATA_RICHNESS_THRESHOLD,
  edgeCitationCount,
  edgeIsCitedVerified,
} from "@/components/fundgraph/graphAnalyzer/analytics";
import { getPresetById } from "@/components/fundgraph/graphAnalyzer/presets";
import {
  GraphAnswerConfidence,
  GraphAnalyzerData,
  GraphAnalyzerDisplayMode,
  GraphAnalyzerEdge,
  GraphAnalyzerNarrative,
  GraphAnalyzerNode,
  GraphAnalyzerPresetId,
  GraphAnalyzerQueryResult,
} from "@/components/fundgraph/graphAnalyzer/types";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asSourceRefs(value: unknown): Array<{ id: string; url: string; title: string; snippet?: string; origin?: string }> {
  if (!Array.isArray(value)) return [];

  const out: Array<{ id: string; url: string; title: string; snippet?: string; origin?: string }> = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = asString(record.url).trim();
    const title = asString(record.title).trim() || url;
    if (!url) continue;

    const key = `${url.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: asString(record.id).trim() || `citation-${out.length + 1}`,
      url,
      title,
      snippet: asString(record.snippet).trim() || undefined,
      origin: asString(record.origin).trim() || undefined,
    });
  }

  return out;
}

function nodeTypeLabel(type: GraphAnalyzerNode["type"]): string {
  if (type === "fund") return "Fund";
  if (type === "company") return "Company";
  if (type === "person") return "Person";
  if (type === "signal") return "Signal";
  if (type === "source") return "Source";
  if (type === "theme") return "Theme";
  return "Claim";
}

function edgeTypeLabel(type: GraphAnalyzerEdge["type"]): string {
  if (type === "INVESTED_IN") return "Invested In";
  if (type === "CO_INVESTED") return "Co-Invested";
  if (type === "SUPPORTED_BY") return "Supported By";
  if (type === "FOUNDED") return "Founded";
  if (type === "CONTRADICTS") return "Contradicts";
  return "Mentions";
}

function formatIntent(intent: NonNullable<GraphAnalyzerQueryResult["explain"]>["intent"]): string {
  if (intent === "path") return "Path";
  if (intent === "funds_in_theme") return "Funds In Theme";
  if (intent === "companies_linked") return "Companies Linked";
  if (intent === "companies_invested_by_fund") return "Fund Portfolio";
  if (intent === "founders_backed_by_fund") return "Founder Links";
  if (intent === "companies_funded_by_both") return "Funded By Both";
  return "Search";
}

function relatedNode(graph: GraphAnalyzerData, edge: GraphAnalyzerEdge, anchorNodeId: string): GraphAnalyzerNode | null {
  const neighborId = edge.source === anchorNodeId ? edge.target : edge.source;
  return graph.nodes.find((node) => node.id === neighborId) ?? null;
}

function confidenceFromCoverage(coverage: number): GraphAnswerConfidence {
  if (coverage >= 0.7) return "high";
  if (coverage >= 0.3) return "medium";
  return "low";
}

function confidenceTone(confidence: GraphAnswerConfidence): string {
  if (confidence === "high") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-rose-300 bg-rose-50 text-rose-800";
}

export function GraphDetailsPanel({
  graph,
  presetId,
  displayMode,
  aggregatedNodeCount,
  selectedNodeId,
  selectedEdgeId,
  queryResult,
  analysis,
  analysisLoading,
  onExpandNeighborhood,
  onShowVerifiedOnly,
  onRunFollowUpQuery,
  onAttachCitations,
}: {
  graph: GraphAnalyzerData;
  presetId: GraphAnalyzerPresetId;
  displayMode: GraphAnalyzerDisplayMode;
  aggregatedNodeCount: number;
  selectedNodeId: string;
  selectedEdgeId?: string;
  queryResult: GraphAnalyzerQueryResult | null;
  analysis?: GraphAnalyzerNarrative | null;
  analysisLoading?: boolean;
  onExpandNeighborhood?: () => void;
  onShowVerifiedOnly?: () => void;
  onRunFollowUpQuery?: (query: string) => void;
  onAttachCitations?: () => void;
}) {
  const preset = getPresetById(presetId);
  const metrics = useMemo(() => buildPresetVerifiedMetrics(graph, presetId), [graph, presetId]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  }, [graph.edges, selectedEdgeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [graph.nodes, selectedNodeId]);

  const edgeEndpoints = useMemo(() => {
    if (!selectedEdge) return null;
    const source = graph.nodes.find((node) => node.id === selectedEdge.source);
    const target = graph.nodes.find((node) => node.id === selectedEdge.target);
    return { source, target };
  }, [graph.nodes, selectedEdge]);

  const incidentEdges = useMemo(() => {
    if (!selectedNode) return [];
    return graph.edges
      .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .sort((left, right) => {
        const verifiedDelta = Number(edgeIsCitedVerified(right)) - Number(edgeIsCitedVerified(left));
        if (verifiedDelta !== 0) return verifiedDelta;
        return edgeCitationCount(right) - edgeCitationCount(left);
      });
  }, [graph.edges, selectedNode]);

  const topConnections = useMemo(
    () =>
      selectedNode
        ? incidentEdges.slice(0, 6).map((edge) => ({
            edge,
            neighbor: relatedNode(graph, edge, selectedNode.id),
            cited: edgeIsCitedVerified(edge),
          }))
        : [],
    [graph, incidentEdges, selectedNode]
  );

  const selectedEdgeRefs = useMemo(() => (selectedEdge ? asSourceRefs(selectedEdge.meta?.sourceRefs) : []), [selectedEdge]);

  const nodeSources = useMemo(() => {
    if (!selectedNode) return [];
    const refs = incidentEdges.flatMap((edge) => asSourceRefs(edge.meta?.sourceRefs));
    const seen = new Set<string>();
    const unique: Array<{ id: string; url: string; title: string; snippet?: string; origin?: string }> = [];
    for (const ref of refs) {
      const key = `${ref.url.toLowerCase()}|${ref.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(ref);
      if (unique.length >= 8) break;
    }
    return unique;
  }, [incidentEdges, selectedNode]);

  const focusEvidenceRefs = selectedEdge ? selectedEdgeRefs : nodeSources;

  const fallbackConfidence = confidenceFromCoverage(metrics.readiness.coverage);
  const answerConfidence = analysis?.evidenceQuality.answerConfidence ?? fallbackConfidence;

  const answerText = analysis?.answer?.trim() || queryResult?.summary || "Run a graph query to generate a direct answer for this panel.";

  const derivationText =
    analysis?.derivationSummary?.trim() ||
    (queryResult
      ? "This answer is derived from highlighted nodes and edges in the current graph view, with citation gating applied where evidence is missing."
      : "Run a query to view derivation details.");

  const pathExplanations =
    analysis?.pathExplanations?.filter(Boolean)?.slice(0, 6) ??
    queryResult?.steps?.filter(Boolean)?.slice(0, 6) ??
    [];

  const takeawayItems = analysis?.keyTakeaways?.filter(Boolean)?.slice(0, 4) ?? [];
  const nextActions = analysis?.nextActions?.filter(Boolean)?.slice(0, 4) ?? [];

  const focusEntityForQuery =
    selectedNode?.label || queryResult?.explain?.entities?.[0] || edgeEndpoints?.source?.label || edgeEndpoints?.target?.label || "";
  const topNeighborLabel = topConnections[0]?.neighbor?.label ?? queryResult?.explain?.entities?.[1] ?? "";

  const ctaButtons = useMemo(() => {
    const buttons: Array<{ id: string; label: string; onClick: () => void }> = [];

    if (onExpandNeighborhood && selectedNode && displayMode !== "expanded") {
      buttons.push({ id: "expand", label: "Expand neighborhood", onClick: onExpandNeighborhood });
    }

    if (onShowVerifiedOnly) {
      buttons.push({ id: "verified", label: "Show only verified", onClick: onShowVerifiedOnly });
    }

    if (onRunFollowUpQuery && focusEntityForQuery) {
      buttons.push({
        id: "co-investor",
        label: "Run co-investor query",
        onClick: () => onRunFollowUpQuery(`who co-invests with ${focusEntityForQuery}`),
      });
    }

    if (onRunFollowUpQuery && focusEntityForQuery && topNeighborLabel && topNeighborLabel !== focusEntityForQuery) {
      buttons.push({
        id: "path",
        label: "Open path query",
        onClick: () => onRunFollowUpQuery(`path between ${focusEntityForQuery} and ${topNeighborLabel}`),
      });
    }

    if (onRunFollowUpQuery && selectedNode?.type === "fund") {
      const relatedFund = topConnections.find((entry) => entry.neighbor?.type === "fund")?.neighbor?.label;
      if (relatedFund && relatedFund !== selectedNode.label) {
        buttons.push({
          id: "compare-funds",
          label: "Compare related funds",
          onClick: () => onRunFollowUpQuery(`common investments between ${selectedNode.label} and ${relatedFund}`),
        });
      }
    }

    if (onAttachCitations) {
      buttons.push({ id: "attach-citations", label: "Attach citations", onClick: onAttachCitations });
    }

    return buttons.slice(0, 6);
  }, [
    displayMode,
    focusEntityForQuery,
    onAttachCitations,
    onExpandNeighborhood,
    onRunFollowUpQuery,
    onShowVerifiedOnly,
    selectedNode,
    topConnections,
    topNeighborLabel,
  ]);

  return (
    <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <section>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Analyzer details</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">{preset?.title ?? "Graph preset"}</h3>
        <p className="mt-1 text-xs text-slate-600">
          Query: <span className="font-semibold text-slate-800">{queryResult?.query || "No active query"}</span>
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          {queryResult?.explain ? `${formatIntent(queryResult.explain.intent)} - ` : ""}
          View mode: <span className="font-semibold capitalize text-slate-700">{displayMode}</span>
          {aggregatedNodeCount > 0 ? ` - ${aggregatedNodeCount} collapsed groups` : ""}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Answer</p>
        {analysisLoading ? (
          <p className="mt-1 text-xs text-slate-600">Generating query-specific answer...</p>
        ) : (
          <p className="mt-1 text-sm text-slate-800">{answerText}</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">How this was derived</p>
        <p className="mt-1 text-xs text-slate-700">{derivationText}</p>
        {pathExplanations.length ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {pathExplanations.map((item) => (
              <li key={item} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Evidence quality</p>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${confidenceTone(answerConfidence)}`}>
            {answerConfidence}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <article className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-slate-500">Verified edges</p>
            <p className="font-semibold text-slate-900">{analysis?.evidenceQuality.verifiedEdges ?? metrics.readiness.citedVerifiedCount}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-slate-500">Unverified edges</p>
            <p className="font-semibold text-slate-900">
              {analysis?.evidenceQuality.unverifiedEdges ?? Math.max(0, metrics.readiness.eligibleCount - metrics.readiness.citedVerifiedCount)}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-slate-500">Citation coverage</p>
            <p className="font-semibold text-slate-900">
              {analysis?.evidenceQuality.citationCoveragePct ?? Math.round(metrics.readiness.coverage * 100)}%
            </p>
          </article>
        </div>

        <p className="mt-2 text-xs text-slate-700">
          {analysis?.evidenceQuality.explanation ||
            (metrics.readiness.coverage >= DATA_RICHNESS_THRESHOLD
              ? "This query is supported by citation-backed edges and can be treated as a high-confidence local read."
              : "This answer is structurally plausible, but citation support is limited and key links remain candidate edges.")}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">What stands out</p>
        {takeawayItems.length ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {takeawayItems.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-600">Run a query to surface query-specific takeaways.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Next best actions</p>
        {nextActions.length ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {nextActions.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-600">No follow-up actions yet. Run a query to generate next steps.</p>
        )}

        {ctaButtons.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {ctaButtons.map((button) => (
              <button
                key={button.id}
                type="button"
                onClick={button.onClick}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                {button.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <details className="rounded-xl border border-slate-200 p-3" open={false}>
        <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Diagnostics</summary>

        <div className="mt-2 space-y-2 text-xs text-slate-700">
          <p>
            Cited coverage: {Math.round(metrics.readiness.coverage * 100)}% ({metrics.readiness.citedVerifiedCount} / {metrics.readiness.eligibleCount}
            )
          </p>
          <p>Hidden metric slots: {metrics.hiddenMetricCount}</p>
          <p>Raw path count: {queryResult?.steps.length ?? 0}</p>

          {selectedEdge ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="font-semibold text-slate-800">Selected edge</p>
              <p>
                {edgeTypeLabel(selectedEdge.type)} - {(edgeEndpoints?.source?.label ?? selectedEdge.source)} -&gt;{" "}
                {(edgeEndpoints?.target?.label ?? selectedEdge.target)}
              </p>
              {edgeIsCitedVerified(selectedEdge) ? (
                <p>Citations: {edgeCitationCount(selectedEdge)}</p>
              ) : (
                <p className="text-amber-700">Hidden (citation required)</p>
              )}
            </div>
          ) : null}

          {selectedNode ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="font-semibold text-slate-800">Selected node</p>
              <p>
                {selectedNode.label} - {nodeTypeLabel(selectedNode.type)}
              </p>
              {topConnections.length ? (
                <ul className="mt-1 space-y-1">
                  {topConnections.slice(0, 4).map((entry) => (
                    <li key={entry.edge.id}>
                      {entry.neighbor?.label ?? "Unknown"} ({edgeTypeLabel(entry.edge.type)}){" "}
                      {entry.cited ? `Citations: ${edgeCitationCount(entry.edge)}` : "Metric hidden"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No connections in this filtered view.</p>
              )}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <p className="font-semibold text-slate-800">Evidence</p>
            {focusEvidenceRefs.length ? (
              <ul className="mt-1 space-y-1">
                {focusEvidenceRefs.slice(0, 3).map((ref) => (
                  <li key={ref.id}>
                    <a href={ref.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-800 hover:text-slate-900">
                      {ref.title}
                    </a>
                    {ref.snippet ? <p className="text-slate-600">{ref.snippet}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No citations attached to this focus yet.</p>
            )}
          </div>
        </div>
      </details>
    </aside>
  );
}
