"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceX, forceY } from "d3-force-3d";
import type { ComponentType } from "react";
import { formatVerifiedEdgeSummary } from "@/components/fundgraph/graphAnalyzer/analytics";
import {
  GraphAnalyzerData,
  GraphLayoutConfig,
  GraphAnalyzerNode,
  GraphAnalyzerEdge,
  GraphAnalyzerDisplayMode,
  GraphAnalyzerPresetId,
} from "@/components/fundgraph/graphAnalyzer/types";
import { degreeByNode } from "@/components/fundgraph/graphAnalyzer/graphModel";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d").then((mod) => mod.default), {
  ssr: false,
}) as unknown as ComponentType<Record<string, unknown>>;

type GraphHandle = {
  centerAt: (x?: number, y?: number, ms?: number) => void;
  zoom: (k: number, ms?: number) => void;
  zoomToFit: (ms?: number, padding?: number) => void;
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation: () => void;
};

type RenderNode = GraphAnalyzerNode & {
  x?: number;
  y?: number;
};

type RenderEdge = Omit<GraphAnalyzerEdge, "source" | "target"> & {
  source: string | RenderNode;
  target: string | RenderNode;
};

const NODE_COLORS: Record<GraphAnalyzerNode["type"], string> = {
  fund: "#2563eb",
  company: "#7c3aed",
  person: "#f97316",
  claim: "#eab308",
  source: "#6b7280",
  signal: "#16a34a",
  theme: "#0f766e",
};

const EDGE_COLORS: Record<GraphAnalyzerEdge["type"], string> = {
  INVESTED_IN: "#8b5cf6",
  FOUNDED: "#f97316",
  MENTIONS: "#64748b",
  SUPPORTED_BY: "#16a34a",
  CO_INVESTED: "#2563eb",
  CONTRADICTS: "#dc2626",
};

function edgeKey(edge: RenderEdge): string {
  const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
  const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
  return `${sourceId}|${targetId}|${edge.type}`;
}

function toAnalyzerEdge(edge: RenderEdge): GraphAnalyzerEdge {
  const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
  const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
  return {
    ...edge,
    source: sourceId,
    target: targetId,
  };
}

function toRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 920, height: 610 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(340, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function GraphCanvas({
  graph,
  layout,
  presetId,
  displayMode,
  labelNodeIds,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onHoverEdge,
  highlightedNodeIds,
  highlightedEdgeIds,
  loading,
  error,
}: {
  graph: GraphAnalyzerData;
  layout: GraphLayoutConfig;
  presetId: GraphAnalyzerPresetId;
  displayMode: GraphAnalyzerDisplayMode;
  labelNodeIds: string[];
  selectedNodeId: string;
  selectedEdgeId?: string;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  onHoverEdge?: (edgeId: string) => void;
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  loading: boolean;
  error: string | null;
}) {
  const graphRef = useRef<GraphHandle | null>(null);
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const fittedKeyRef = useRef<string>("");

  const graphNodeIdSet = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph.nodes]);
  const graphEdgeIdSet = useMemo(() => new Set(graph.edges.map((edge) => edge.id)), [graph.edges]);
  const effectiveHighlightedNodeIds = useMemo(
    () => highlightedNodeIds.filter((id) => graphNodeIdSet.has(id)),
    [graphNodeIdSet, highlightedNodeIds]
  );
  const highlightedNodeSet = useMemo(() => new Set(effectiveHighlightedNodeIds), [effectiveHighlightedNodeIds]);
  const highlightedEdgeSet = useMemo(
    () => new Set(highlightedEdgeIds.filter((id) => graphEdgeIdSet.has(id))),
    [graphEdgeIdSet, highlightedEdgeIds]
  );
  const labeledNodeSet = useMemo(() => new Set(labelNodeIds), [labelNodeIds]);
  const queryHighlightActive = highlightedNodeSet.size > 0 || highlightedEdgeSet.size > 0;

  const degreeMap = useMemo(() => degreeByNode(graph), [graph]);

  const neighborhood = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const adjacent = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === selectedNodeId) adjacent.add(edge.target);
      if (edge.target === selectedNodeId) adjacent.add(edge.source);
    }
    return adjacent;
  }, [graph.edges, selectedNodeId]);

  const renderData = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => ({ ...node })) as RenderNode[],
      links: graph.edges.map((edge) => ({ ...edge })) as RenderEdge[],
    }),
    [graph.edges, graph.nodes]
  );

  const fitKey = useMemo(() => {
    return `${renderData.nodes.length}:${renderData.links.length}:${size.width}x${size.height}`;
  }, [renderData.links.length, renderData.nodes.length, size.height, size.width]);

  const nodeRadius = useMemo(
    () => (node: RenderNode) => {
      const degree = degreeMap.get(node.id) ?? 0;
      return 6 + Math.log(degree + 1) * 5.4;
    },
    [degreeMap]
  );

  const targetX = useMemo(
    () => (node: RenderNode): number => {
      if (displayMode === "overview") {
        if (presetId === "FOUNDER_NETWORK") {
          if (node.type === "person") return -240;
          if (node.type === "company") return 0;
          if (node.type === "fund") return 240;
        }
        if (presetId === "THEME_MAP") {
          if (node.type === "theme") return -120;
          if (node.type === "signal") return 0;
          if (node.type === "fund") return 160;
          if (node.type === "company") return 80;
          if (node.type === "source") return 220;
        }
        if (presetId === "PORTFOLIO_OVERLAP") {
          const overlapGroup = typeof node.meta?.overlapGroup === "string" ? node.meta.overlapGroup : "";
          if (overlapGroup === "left") return -260;
          if (overlapGroup === "right") return 260;
          if (overlapGroup === "shared") return 0;
        }
        if (presetId === "SIGNAL_DIFFUSION") {
          if (node.type === "signal") return -220;
          if (node.type === "company") return 0;
          if (node.type === "fund") return 220;
          if (node.type === "source") return 300;
        }
        if (presetId === "CO_INVESTMENT") {
          if (node.type === "fund") return -120;
          if (node.type === "company") return 130;
        }
      }
      return node.type === "fund" ? -20 : node.type === "company" ? 20 : 0;
    },
    [displayMode, presetId]
  );

  const targetY = useMemo(
    () => (node: RenderNode): number => {
      if (displayMode === "overview") {
        if (presetId === "THEME_MAP") {
          if (node.type === "theme") return -220;
          if (node.type === "fund" || node.type === "company") return -20;
          if (node.type === "signal" || node.type === "claim") return 130;
          if (node.type === "source") return 220;
        }
        if (presetId === "SIGNAL_DIFFUSION") {
          if (node.type === "signal") return -120;
          if (node.type === "company") return 20;
          if (node.type === "fund") return 100;
          if (node.type === "source") return 200;
        }
      }
      return 0;
    },
    [displayMode, presetId]
  );

  useEffect(() => {
    const handle = graphRef.current;
    if (!handle || !renderData.nodes.length) return;

    const linkForce = handle.d3Force("link") as
      | {
          distance?: (value: number | ((edge: RenderEdge) => number)) => void;
          strength?: (value: number | ((edge: RenderEdge) => number)) => void;
        }
      | undefined;
    linkForce?.distance?.((edge: RenderEdge) => {
      if (edge.type === "CO_INVESTED") return layout.linkDistance + 22;
      if (edge.type === "SUPPORTED_BY") return layout.linkDistance - 12;
      return layout.linkDistance;
    });
    linkForce?.strength?.((edge: RenderEdge) => {
      if (edge.type === "CO_INVESTED") return 0.22;
      if (edge.type === "CONTRADICTS") return 0.32;
      return 0.35;
    });

    const chargeForce = handle.d3Force("charge") as
      | {
          strength?: (value: number | ((node: RenderNode) => number)) => void;
        }
      | undefined;
    chargeForce?.strength?.((node: RenderNode) => {
      const degree = degreeMap.get(node.id) ?? 0;
      const aggregate = node.meta?.aggregate ? 14 : 0;
      return layout.chargeStrength - degree * 9 - aggregate;
    });

    const xForceStrength = displayMode === "overview" ? 0.2 : displayMode === "focus" ? 0.09 : 0.07;
    const yForceStrength = displayMode === "overview" ? 0.17 : displayMode === "focus" ? 0.08 : 0.06;
    handle.d3Force("x", forceX((node) => targetX(node as RenderNode)).strength(xForceStrength));
    handle.d3Force("y", forceY((node) => targetY(node as RenderNode)).strength(yForceStrength));
    handle.d3Force(
      "collide",
      forceCollide((node) => {
        const renderNode = node as RenderNode;
        const labelPadding = labeledNodeSet.has(renderNode.id) ? 12 : 6;
        return nodeRadius(renderNode) + labelPadding;
      })
        .strength(displayMode === "overview" ? 1 : 0.9)
        .iterations(displayMode === "overview" ? 2 : 1)
    );

    handle.d3ReheatSimulation();
  }, [degreeMap, displayMode, labeledNodeSet, layout.chargeStrength, layout.linkDistance, nodeRadius, renderData.nodes.length, targetX, targetY]);

  useEffect(() => {
    if (!renderData.nodes.length) return;
    const handle = graphRef.current;
    if (!handle) return;

    if (effectiveHighlightedNodeIds.length > 1) {
      handle.zoomToFit(560, 96);
      return;
    }

    const targetId = effectiveHighlightedNodeIds[0] || selectedNodeId;
    if (!targetId) {
      handle.zoomToFit(520, 88);
      return;
    }

    const targetNode = renderData.nodes.find((node) => node.id === targetId);
    if (!targetNode || typeof targetNode.x !== "number" || typeof targetNode.y !== "number") {
      handle.zoomToFit(520, 88);
      return;
    }

    handle.centerAt(targetNode.x, targetNode.y, 420);
    handle.zoom(1.65, 420);
  }, [effectiveHighlightedNodeIds, renderData.nodes, selectedNodeId]);

  useEffect(() => {
    if (!renderData.nodes.length) return;
    if (selectedNodeId || effectiveHighlightedNodeIds.length) return;
    const handle = graphRef.current;
    if (!handle) return;

    const timeoutId = window.setTimeout(() => {
      handle.zoomToFit(420, 88);
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [effectiveHighlightedNodeIds.length, fitKey, renderData.nodes.length, selectedNodeId]);

  function nodeSize(node: RenderNode): number {
    return nodeRadius(node);
  }

  function nodeOpacity(node: RenderNode): number {
    if (highlightedNodeSet.size) {
      return highlightedNodeSet.has(node.id) ? 0.96 : 0.1;
    }
    if (!selectedNodeId) return displayMode === "overview" ? 0.8 : 0.9;
    if (node.id === selectedNodeId) return 1;
    if (neighborhood.has(node.id)) return 0.65;
    return displayMode === "expanded" ? 0.2 : 0.12;
  }

  function shouldRenderNodeLabel(node: RenderNode): boolean {
    if (node.id === selectedNodeId || node.id === hoveredNodeId) return true;
    if (highlightedNodeSet.size) return highlightedNodeSet.has(node.id);
    if (displayMode === "overview") {
      if (zoomLevel > 1.35 && neighborhood.has(node.id)) return true;
      return labeledNodeSet.has(node.id);
    }
    if (displayMode === "focus") {
      return neighborhood.has(node.id) || labeledNodeSet.has(node.id) || zoomLevel > 1.2;
    }
    if (zoomLevel > 1.08) return true;
    return neighborhood.has(node.id) || labeledNodeSet.has(node.id);
  }

  function drawNodeLabel(node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number): void {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;
    if (!shouldRenderNodeLabel(node)) return;

    const label = node.label.length > 28 ? `${node.label.slice(0, 25)}...` : node.label;
    const radius = nodeSize(node);
    const fontSize = Math.max(8, Math.min(12, 11 / Math.max(0.82, globalScale)));
    const paddingX = 4;
    const paddingY = 2;

    ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = fontSize + paddingY * 2;
    const x = node.x + radius + 4;
    const y = node.y - boxHeight / 2;

    ctx.fillStyle = node.id === selectedNodeId ? "rgba(15, 23, 42, 0.9)" : "rgba(248, 250, 252, 0.86)";
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = node.id === selectedNodeId ? "rgba(15, 23, 42, 0.95)" : "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = node.id === selectedNodeId ? "rgba(255, 255, 255, 0.98)" : "rgba(15, 23, 42, 0.94)";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + paddingX, node.y);
  }

  function drawNodeHalo(node: RenderNode, ctx: CanvasRenderingContext2D): void {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;
    const radius = nodeSize(node);
    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;
    const isNeighbor = neighborhood.has(node.id);
    if (!isSelected && !isHovered && !isNeighbor) return;

    const ringRadius = radius + (isSelected ? 7 : isHovered ? 5 : 3);
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringRadius, 0, 2 * Math.PI, false);
    ctx.strokeStyle = isSelected
      ? "rgba(15, 23, 42, 0.95)"
      : isHovered
        ? "rgba(30, 64, 175, 0.74)"
        : "rgba(71, 85, 105, 0.45)";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();
  }

  function edgeOpacity(edge: RenderEdge): number {
    const key = edge.id || edgeKey(edge);
    if (selectedEdgeId && selectedEdgeId === key) return 1;
    if (highlightedEdgeSet.size) {
      return highlightedEdgeSet.has(key) ? 0.92 : 0.08;
    }
    if (hoveredEdgeKey) {
      return hoveredEdgeKey === key ? 1 : 0.24;
    }
    if (!selectedNodeId) return displayMode === "overview" ? 0.16 : 0.36;

    const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;

    if (sourceId === selectedNodeId || targetId === selectedNodeId) return 0.95;
    if (neighborhood.has(sourceId) || neighborhood.has(targetId)) return 0.42;
    return 0.08;
  }

  function edgeColor(edge: RenderEdge): string {
    return toRgba(EDGE_COLORS[edge.type] ?? "#94a3b8", edgeOpacity(edge));
  }

  function nodeColor(node: RenderNode): string {
    const base = node.id === selectedNodeId ? "#0f172a" : NODE_COLORS[node.type] ?? "#94a3b8";
    return toRgba(base, nodeOpacity(node));
  }

  function compactEdgeLabel(edge: RenderEdge): string {
    const summary = formatVerifiedEdgeSummary(toAnalyzerEdge(edge));
    if (summary.detail === "Hidden (citation required)") {
      return `${summary.heading}\nHidden (citation required)`;
    }
    return `${summary.heading}\n${summary.detail}\nCitations: ${summary.citations}`;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div ref={containerRef} className="relative h-[66vh] min-h-[420px] w-full overflow-hidden rounded-xl bg-slate-50">
        {error ? (
          <div className="flex h-full items-center justify-center px-4 text-sm text-rose-700">{error}</div>
        ) : loading && !renderData.nodes.length ? (
          <div className="h-full animate-pulse p-5">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="mt-4 h-[75%] w-full rounded-xl bg-slate-200/80" />
            <div className="mt-4 h-3 w-64 rounded bg-slate-200" />
          </div>
        ) : !renderData.nodes.length ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
            No nodes match this investigation setup. Adjust filters, timeline, or focus.
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={renderData}
            backgroundColor="#f8fafc"
            nodeVal={(nodeRaw: unknown) => nodeSize(nodeRaw as RenderNode)}
            nodeColor={(nodeRaw: unknown) => nodeColor(nodeRaw as RenderNode)}
            nodeLabel={(nodeRaw: unknown) => {
              const node = nodeRaw as RenderNode;
              return `${node.label}\n${node.type}`;
            }}
            nodeCanvasObject={(nodeRaw: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const node = nodeRaw as RenderNode;
              drawNodeHalo(node, ctx);
              drawNodeLabel(node, ctx, globalScale);
            }}
            nodeCanvasObjectMode={() => "after"}
            linkColor={(edgeRaw: unknown) => edgeColor(edgeRaw as RenderEdge)}
            linkWidth={(edgeRaw: unknown) => {
              const edge = edgeRaw as RenderEdge;
              const base = Math.max(0.8, Math.min(2.4, (edge.weight ?? 0.6) * 1.6));
              if (highlightedEdgeSet.has(edge.id)) return base + 1;
              return base;
            }}
            linkLineDash={(edgeRaw: unknown) => ((edgeRaw as RenderEdge).type === "CONTRADICTS" ? [7, 6] : undefined)}
            linkDirectionalArrowLength={(edgeRaw: unknown) => {
              const edge = edgeRaw as RenderEdge;
              if (edge.type === "CO_INVESTED") return 0;
              return 5;
            }}
            linkDirectionalArrowRelPos={0.96}
            linkDirectionalArrowColor={(edgeRaw: unknown) => edgeColor(edgeRaw as RenderEdge)}
            linkLabel={(edgeRaw: unknown) => compactEdgeLabel(edgeRaw as RenderEdge)}
            onNodeClick={(nodeRaw: unknown) => {
              const node = nodeRaw as RenderNode;
              onSelectNode(node.id);
            }}
            onNodeHover={(nodeRaw: unknown) => {
              if (!nodeRaw) {
                setHoveredNodeId("");
                return;
              }
              setHoveredNodeId((nodeRaw as RenderNode).id);
            }}
            onBackgroundClick={() => {
              onSelectNode("");
              onSelectEdge?.("");
            }}
            onLinkClick={(edgeRaw: unknown) => {
              if (!edgeRaw) return;
              onSelectEdge?.((edgeRaw as RenderEdge).id);
            }}
            onLinkHover={(edgeRaw: unknown) => {
              if (!edgeRaw) {
                setHoveredEdgeKey(null);
                onHoverEdge?.("");
                return;
              }
              const edgeId = (edgeRaw as RenderEdge).id;
              setHoveredEdgeKey(edgeId);
              onHoverEdge?.(edgeId);
            }}
            warmupTicks={60}
            cooldownTicks={queryHighlightActive ? Math.min(layout.cooldownTicks, 90) : layout.cooldownTicks}
            d3AlphaDecay={queryHighlightActive ? 0.08 : 0.04}
            d3VelocityDecay={0.26}
            onZoom={(transform: { k: number }) => setZoomLevel(transform.k)}
            onEngineStop={() => {
              const handle = graphRef.current;
              if (!handle) return;

              if (effectiveHighlightedNodeIds.length > 1) {
                handle.zoomToFit(560, 96);
                fittedKeyRef.current = fitKey;
                return;
              }

              const targetId = effectiveHighlightedNodeIds[0] || selectedNodeId;
              if (targetId) {
                const targetNode = renderData.nodes.find((node) => node.id === targetId);
                if (targetNode && typeof targetNode.x === "number" && typeof targetNode.y === "number") {
                  handle.centerAt(targetNode.x, targetNode.y, 420);
                  handle.zoom(1.65, 420);
                } else {
                  handle.zoomToFit(520, 88);
                }
                fittedKeyRef.current = fitKey;
                return;
              }

              if (fittedKeyRef.current === fitKey) return;
              handle.zoomToFit(520, 88);
              fittedKeyRef.current = fitKey;
            }}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Showing {graph.nodes.length} nodes / {graph.edges.length} edges
        </span>
        <span>
          {highlightedEdgeSet.size
            ? "Path/query highlight active"
            : selectedNodeId
              ? `${displayMode} mode · node focus active`
              : `${displayMode} mode`}
        </span>
      </div>
    </section>
  );
}
