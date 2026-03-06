"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { GraphDetailsPanel } from "@/components/fundgraph/GraphDetailsPanel";
import { GraphFilters } from "@/components/fundgraph/GraphFilters";
import { GraphLegend } from "@/components/fundgraph/GraphLegend";
import { UnlockBanner } from "@/components/fundgraph/UnlockBanner";
import { useFundGraphState } from "@/fundgraph/state";
import { getGraphData } from "@/lib/fundgraph/client";
import { GRAPH_NODE_COLORS, GraphApiResponse, GraphData, GraphLink, GraphNode, GraphNodeType } from "@/lib/fundgraph/graphTypes";

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

type RenderNode = GraphNode & {
  x?: number;
  y?: number;
};

type RenderLink = Omit<GraphLink, "source" | "target"> & {
  source: string | RenderNode;
  target: string | RenderNode;
};

type RenderGraphData = {
  nodes: RenderNode[];
  links: RenderLink[];
};

const MAX_GRAPH_NODES = 60;
const EMPTY_GRAPH: GraphApiResponse = {
  mode: "hybrid",
  nodes: [],
  links: [],
};

const DEFAULT_NODE_TYPE_ENABLED: Record<GraphNodeType, boolean> = {
  fund: true,
  company: true,
  claim: false,
  signal: true,
  source: false,
  person: false,
};

const EDGE_BASE_COLORS: Record<string, string> = {
  CITES: "#64748b",
  MENTIONED_IN: "#475569",
  PORTFOLIO: "#16a34a",
  SIGNAL_FOR: "#22c55e",
  ABOUT: "#334155",
  MANAGES: "#0f766e",
};

const GRAPH_LABEL_FONT = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function bfsNodeSet(links: GraphLink[], startId: string, depth: number): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const link of links) {
    const left = adjacency.get(link.source) ?? new Set<string>();
    left.add(link.target);
    adjacency.set(link.source, left);

    const right = adjacency.get(link.target) ?? new Set<string>();
    right.add(link.source);
    adjacency.set(link.target, right);
  }

  const keep = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);

  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (keep.has(neighbor)) continue;
        keep.add(neighbor);
        next.add(neighbor);
      }
    }
    if (!next.size) break;
    frontier = next;
  }

  return keep;
}

function largestConnectedNodeSet(nodes: GraphNode[], links: GraphLink[]): Set<string> {
  if (!nodes.length) return new Set<string>();

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set<string>());
  }

  for (const link of links) {
    const left = adjacency.get(link.source);
    const right = adjacency.get(link.target);
    if (left) left.add(link.target);
    if (right) right.add(link.source);
  }

  const visited = new Set<string>();
  let largest = new Set<string>();

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    visited.add(node.id);
    const component = new Set<string>();

    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      component.add(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (component.size > largest.size) {
      largest = component;
    }
  }

  return largest;
}

function isVerifiedNode(node: GraphNode): boolean {
  if (node.type !== "claim" && node.type !== "signal") return true;
  const trustTier = typeof node.meta?.trustTier === "string" ? node.meta.trustTier : "";
  const verifiedCount = typeof node.meta?.verifiedCount === "number" ? node.meta.verifiedCount : 0;
  const disputedCount = typeof node.meta?.disputedCount === "number" ? node.meta.disputedCount : 0;
  return trustTier === "HIGH" || verifiedCount > disputedCount;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function linkEndpointId(endpoint: string | RenderNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function linkKey(link: RenderLink): string {
  return `${linkEndpointId(link.source)}|${linkEndpointId(link.target)}|${link.type}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  type: GraphNodeType,
  x: number,
  y: number,
  radius: number
): void {
  ctx.beginPath();
  if (type === "claim") {
    for (let point = 0; point < 6; point += 1) {
      const angle = Math.PI / 6 + (point * Math.PI) / 3;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }

  if (type === "source") {
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.closePath();
    return;
  }

  if (type === "signal") {
    ctx.moveTo(x, y - radius * 1.24);
    ctx.lineTo(x + radius * 1.12, y);
    ctx.lineTo(x, y + radius * 1.24);
    ctx.lineTo(x - radius * 1.12, y);
    ctx.closePath();
    return;
  }

  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
}

function trimLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, Math.max(0, max - 1))}…` : label;
}

function tooltipText(node: RenderNode): string {
  const meta = node.meta ?? {};
  if (node.type === "fund") {
    const aum = asNumber(meta.aumM);
    const trend = asNumber(meta.trendScore);
    return `${node.label}\nFund\nAUM: ${aum ? `$${aum}M` : "N/A"} · Trend: ${trend ?? "N/A"}`;
  }
  if (node.type === "company") {
    const related = asString(meta.relatedFundName) ?? asString(meta.relatedFundId);
    return `${node.label}\nCompany\n${related ? `Linked fund: ${related}` : "Portfolio relationship"}`;
  }
  if (node.type === "claim") {
    const snippet = asString(meta.snippet) ?? node.label;
    return `${node.label}\nClaim\n${snippet.slice(0, 140)}`;
  }
  if (node.type === "source") {
    const title = asString(meta.title) ?? node.label;
    const url = asString(meta.url);
    return `${node.label}\nSource\n${title}${url ? `\n${url}` : ""}`;
  }
  if (node.type === "signal") {
    const confidence = asNumber(meta.confidence);
    return `${node.label}\nSignal\nConfidence: ${confidence ? Math.round(confidence * 100) : "N/A"}%`;
  }
  return `${node.label}\nPerson`;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 900, height: 620 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(340, Math.floor(entry.contentRect.height));
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function GraphView({
  fundId,
  slug,
  claimId,
  title,
}: {
  fundId?: string;
  slug?: string;
  claimId?: string;
  title?: string;
}) {
  const router = useRouter();
  const { limits, tier } = useFundGraphState();
  const maxDepth = limits.graphDepth;
  const graphRef = useRef<GraphHandle | null>(null);
  const { ref: canvasWrapRef, size } = useElementSize<HTMLDivElement>();
  const [graph, setGraph] = useState<GraphApiResponse>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [nodeTypeEnabled, setNodeTypeEnabled] = useState<Record<GraphNodeType, boolean>>(() => ({
    ...DEFAULT_NODE_TYPE_ENABLED,
    claim: Boolean(claimId),
  }));
  const [search, setSearch] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [focusEnabled, setFocusEnabled] = useState(Boolean(fundId || slug || claimId));
  const [focusNodeId, setFocusNodeId] = useState("");
  const [depth, setDepth] = useState(2);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [layoutStable, setLayoutStable] = useState(false);
  const autoFittedKeyRef = useRef<string>("");

  const refreshGraph = useCallback(async () => {
    setLoading(true);
    setRequestError(null);
    setLayoutStable(false);

    try {
      const payload = await getGraphData({
        fundId,
        slug,
        claimId,
        depth: Math.min(depth, maxDepth),
        limit: MAX_GRAPH_NODES,
      });
      setGraph(payload);

      if (!focusNodeId && payload.focusNodeId) {
        setFocusNodeId(payload.focusNodeId);
      }
      if (!selectedNodeId && payload.focusNodeId) {
        setSelectedNodeId(payload.focusNodeId);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to load graph data.");
    } finally {
      setLoading(false);
    }
  }, [claimId, depth, focusNodeId, fundId, maxDepth, selectedNodeId, slug]);

  useEffect(() => {
    void refreshGraph();
  }, [refreshGraph]);

  useEffect(() => {
    if (depth > maxDepth) {
      setDepth(maxDepth);
    }
  }, [depth, maxDepth]);

  const filteredGraph = useMemo<GraphData>(() => {
    const baseNodes = graph.nodes.filter((node) => nodeTypeEnabled[node.type]);
    const nodeMap = new Map(baseNodes.map((node) => [node.id, node]));

    let nodes = baseNodes;
    let links = graph.links.filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target));

    if (onlyVerified) {
      nodes = nodes.filter((node) => isVerifiedNode(node));
      const allowed = new Set(nodes.map((node) => node.id));
      links = links.filter((link) => allowed.has(link.source) && allowed.has(link.target));
    }

    if (search.trim()) {
      const query = normalize(search);
      const matching = new Set(
        nodes
          .filter((node) => normalize(node.label).includes(query) || normalize(node.id).includes(query))
          .map((node) => node.id)
      );

      for (const link of links) {
        if (matching.has(link.source)) matching.add(link.target);
        if (matching.has(link.target)) matching.add(link.source);
      }

      nodes = nodes.filter((node) => matching.has(node.id));
      links = links.filter((link) => matching.has(link.source) && matching.has(link.target));
    }

    if (focusEnabled && focusNodeId) {
      const keep = bfsNodeSet(links, focusNodeId, depth);
      nodes = nodes.filter((node) => keep.has(node.id));
      links = links.filter((link) => keep.has(link.source) && keep.has(link.target));
    }

    return {
      nodes,
      links,
    };
  }, [depth, focusEnabled, focusNodeId, graph.links, graph.nodes, nodeTypeEnabled, onlyVerified, search]);

  const nodeDegreeMap = useMemo(() => {
    const degrees = new Map<string, number>();
    for (const node of filteredGraph.nodes) {
      degrees.set(node.id, 0);
    }

    for (const link of filteredGraph.links) {
      degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
      degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
    }

    return degrees;
  }, [filteredGraph.links, filteredGraph.nodes]);

  const renderGraphData = useMemo<RenderGraphData>(() => {
    return {
      nodes: filteredGraph.nodes.map((node, idx) => {
        const ring = Math.floor(idx / 11) + 1;
        const angle = idx * 2.399963229728653;
        const radial = 42 + ring * 34;

        return {
          ...node,
          x: Math.cos(angle) * radial,
          y: Math.sin(angle) * radial,
        };
      }),
      links: filteredGraph.links.map((link) => ({ ...link })),
    };
  }, [filteredGraph.links, filteredGraph.nodes]);

  const selectedNode = useMemo(
    () => filteredGraph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [filteredGraph.nodes, selectedNodeId]
  );

  const relatedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const adjacentIds = new Set<string>();
    for (const link of filteredGraph.links) {
      if (link.source === selectedNode.id) adjacentIds.add(link.target);
      if (link.target === selectedNode.id) adjacentIds.add(link.source);
    }
    return filteredGraph.nodes.filter((node) => adjacentIds.has(node.id));
  }, [filteredGraph.links, filteredGraph.nodes, selectedNode]);
  const selectionActive = Boolean(selectedNode && selectedNodeId);

  const selectedNeighborhood = useMemo(() => {
    const neighbors = new Set<string>();
    if (!selectedNodeId) return neighbors;

    for (const link of filteredGraph.links) {
      if (link.source === selectedNodeId) neighbors.add(link.target);
      if (link.target === selectedNodeId) neighbors.add(link.source);
    }
    return neighbors;
  }, [filteredGraph.links, selectedNodeId]);

  const primaryNodeIds = useMemo(
    () => largestConnectedNodeSet(filteredGraph.nodes, filteredGraph.links),
    [filteredGraph.links, filteredGraph.nodes]
  );

  const defaultViewNodeIds = useMemo(() => {
    if (focusEnabled || selectionActive || search.trim()) {
      return new Set(filteredGraph.nodes.map((node) => node.id));
    }
    if (primaryNodeIds.size >= 4) return primaryNodeIds;
    return new Set(filteredGraph.nodes.map((node) => node.id));
  }, [filteredGraph.nodes, focusEnabled, primaryNodeIds, search, selectionActive]);

  const autoFitKey = useMemo(() => {
    const sortedIds = Array.from(defaultViewNodeIds).sort().join(",");
    return `${sortedIds}|${size.width}x${size.height}|${focusEnabled ? focusNodeId || "focused" : "global"}`;
  }, [defaultViewNodeIds, focusEnabled, focusNodeId, size.height, size.width]);

  const focusOptions = useMemo(() => {
    return graph.nodes
      .filter((node) => node.type === "fund" || node.type === "company")
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 180)
      .map((node) => ({ id: node.id, label: node.label, type: node.type }));
  }, [graph.nodes]);

  const fitToNodeSet = useCallback(
    (nodeIds: Set<string>, ms: number) => {
      const graphHandle = graphRef.current;
      if (!graphHandle) return;
      if (!nodeIds.size) {
        graphHandle.zoomToFit(ms, 80);
        return;
      }

      const targets = renderGraphData.nodes.filter(
        (node) => nodeIds.has(node.id) && typeof node.x === "number" && typeof node.y === "number"
      );
      if (targets.length < 2) {
        graphHandle.zoomToFit(ms, 80);
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const node of targets) {
        const x = node.x as number;
        const y = node.y as number;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const worldPadding = 32;
      const worldWidth = Math.max(60, maxX - minX + worldPadding * 2);
      const worldHeight = Math.max(60, maxY - minY + worldPadding * 2);
      const zoomX = (size.width * 0.88) / worldWidth;
      const zoomY = (size.height * 0.82) / worldHeight;
      const zoom = Math.max(0.95, Math.min(2.45, Math.min(zoomX, zoomY)));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      graphHandle.centerAt(centerX, centerY, ms);
      graphHandle.zoom(zoom, ms);
    },
    [renderGraphData.nodes, size.height, size.width]
  );

  const applyOverviewPreset = useCallback(() => {
    autoFittedKeyRef.current = "";
    setLayoutStable(false);
    setSearch("");
    setOnlyVerified(false);
    setSelectedNodeId("");
    setHoveredLinkKey(null);
    setNodeTypeEnabled({
      ...DEFAULT_NODE_TYPE_ENABLED,
      claim: Boolean(claimId),
    });

    if (!fundId && !slug && !claimId) {
      setFocusEnabled(false);
      setFocusNodeId("");
      setDepth(Math.min(2, maxDepth));
    }
  }, [claimId, fundId, maxDepth, slug]);

  useEffect(() => {
    if (!focusEnabled || !focusNodeId) return;
    const target = renderGraphData.nodes.find((node) => node.id === focusNodeId);
    if (!target || typeof target.x !== "number" || typeof target.y !== "number") {
      graphRef.current?.zoomToFit(650, 80);
      return;
    }

    graphRef.current?.centerAt(target.x, target.y, 500);
    graphRef.current?.zoom(2.1, 500);
  }, [focusEnabled, focusNodeId, renderGraphData.nodes]);

  useEffect(() => {
    if (!renderGraphData.nodes.length) return;
    const graphHandle = graphRef.current;
    if (!graphHandle) return;

    const linkForce = graphHandle.d3Force("link") as
      | {
          distance?: (distance: number | ((link: RenderLink) => number)) => void;
          strength?: (strength: number | ((link: RenderLink) => number)) => void;
          iterations?: (count: number) => void;
        }
      | undefined;
    linkForce?.distance?.((link: RenderLink) => {
      switch (link.type) {
        case "PORTFOLIO":
          return 162;
        case "SIGNAL_FOR":
          return 138;
        case "ABOUT":
          return 148;
        case "CITES":
          return 128;
        case "MENTIONED_IN":
          return 118;
        case "MANAGES":
          return 142;
        default:
          return 132;
      }
    });
    linkForce?.strength?.((link: RenderLink) => {
      if (link.type === "PORTFOLIO" || link.type === "SIGNAL_FOR") return 0.34;
      if (link.type === "ABOUT") return 0.3;
      return 0.24;
    });
    linkForce?.iterations?.(1);

    const chargeForce = graphHandle.d3Force("charge") as
      | {
          strength?: (strength: number | ((node: RenderNode) => number)) => void;
        }
      | undefined;
    chargeForce?.strength?.((node: RenderNode) => {
      const degree = nodeDegreeMap.get(node.id) ?? 0;
      const base =
        node.type === "fund"
          ? -420
          : node.type === "company"
            ? -330
            : node.type === "claim"
              ? -315
              : node.type === "signal"
                ? -290
                : node.type === "person"
                  ? -260
                  : -220;
      return base - degree * 8;
    });

    graphHandle.d3ReheatSimulation();
  }, [nodeDegreeMap, renderGraphData.links, renderGraphData.nodes]);

  useEffect(() => {
    if (focusEnabled || !renderGraphData.nodes.length) return;
    if (autoFittedKeyRef.current === autoFitKey) return;

    const timeoutId = window.setTimeout(() => {
      fitToNodeSet(defaultViewNodeIds, 640);
      autoFittedKeyRef.current = autoFitKey;
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [autoFitKey, defaultViewNodeIds, fitToNodeSet, focusEnabled, renderGraphData.nodes.length]);

  function nodeSize(node: RenderNode): number {
    const degree = nodeDegreeMap.get(node.id) ?? 0;
    const signalStrength = asNumber(node.meta?.signalStrength) ?? asNumber(node.meta?.trustScore) ?? 0;
    const mentions = asNumber(node.meta?.mentionCount) ?? asNumber(node.meta?.mentions) ?? 0;
    const weightedDegree = degree + Math.max(0, signalStrength) / 25 + Math.max(0, mentions) / 10;
    return 6 + Math.log(weightedDegree + 1) * 4;
  }

  function nodeOpacity(node: RenderNode): number {
    if (hoveredLinkKey) {
      if (node.id === selectedNodeId) return 1;
      const incident = filteredGraph.links.some((link) => linkKey(link as RenderLink) === hoveredLinkKey && (link.source === node.id || link.target === node.id));
      return incident ? 0.88 : 0.25;
    }
    if (!selectionActive) return 0.95;
    if (node.id === selectedNodeId) return 1;
    if (selectedNeighborhood.has(node.id)) return 0.62;
    return 0.2;
  }

  function linkOpacity(link: RenderLink): number {
    const key = linkKey(link);
    if (hoveredLinkKey) {
      if (key === hoveredLinkKey) return 1;
      return 0.22;
    }
    if (!selectionActive) return 0.72;
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    if (sourceId === selectedNodeId || targetId === selectedNodeId) return 0.95;
    if (selectedNeighborhood.has(sourceId) || selectedNeighborhood.has(targetId)) return 0.45;
    return 0.18;
  }

  function linkIsPrimary(link: RenderLink): boolean {
    if (hoveredLinkKey && linkKey(link) === hoveredLinkKey) return true;
    if (!selectionActive) return false;
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    return sourceId === selectedNodeId || targetId === selectedNodeId;
  }

  function linkColor(link: RenderLink): string {
    const baseHex = EDGE_BASE_COLORS[link.type] ?? "#94a3b8";
    return hexToRgba(baseHex, linkOpacity(link));
  }

  function drawNodeCanvas(node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number): void {
    const x = typeof node.x === "number" ? node.x : 0;
    const y = typeof node.y === "number" ? node.y : 0;
    const radius = nodeSize(node);
    const opacity = nodeOpacity(node);
    const selected = node.id === selectedNodeId;
    const baseHex = selected ? "#0f172a" : GRAPH_NODE_COLORS[node.type];

    ctx.save();
    ctx.fillStyle = hexToRgba(baseHex, opacity);
    drawNodeShape(ctx, node.type, x, y, radius);
    ctx.fill();

    ctx.lineWidth = selected ? 2.4 : 1.1;
    ctx.strokeStyle = selected ? "#0f172a" : hexToRgba("#0f172a", Math.max(0.25, opacity * 0.55));
    ctx.stroke();

    const showLabel =
      selected ||
      selectedNeighborhood.has(node.id) ||
      globalScale > 2.1 ||
      (node.type === "fund" && globalScale > 1.55) ||
      radius >= 11.6;
    if (showLabel) {
      const label = trimLabel(node.label, 28);
      const fontSize = Math.max(9, Math.min(13, 12 / globalScale));
      ctx.font = `${selected ? 600 : 500} ${fontSize}px ${GRAPH_LABEL_FONT}`;
      const textWidth = ctx.measureText(label).width;
      const labelX = x + radius + 6;
      const labelY = y - radius - 4;
      const padX = 5;
      const padY = 3;
      ctx.fillStyle = hexToRgba("#f8fafc", 0.92);
      ctx.fillRect(labelX - padX, labelY - fontSize, textWidth + padX * 2, fontSize + padY * 2);
      ctx.strokeStyle = hexToRgba("#cbd5e1", 0.95);
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX - padX, labelY - fontSize, textWidth + padX * 2, fontSize + padY * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(label, labelX, labelY + 1);
    }

    ctx.restore();
  }

  function drawLinkLabel(link: RenderLink, ctx: CanvasRenderingContext2D, globalScale: number): void {
    const source = link.source as RenderNode;
    const target = link.target as RenderNode;
    if (
      typeof source !== "object" ||
      typeof target !== "object" ||
      typeof source.x !== "number" ||
      typeof source.y !== "number" ||
      typeof target.x !== "number" ||
      typeof target.y !== "number"
    ) {
      return;
    }

    const key = linkKey(link);
    const showLabel = linkIsPrimary(link) || key === hoveredLinkKey || globalScale > 2.25;
    if (!showLabel) return;

    const label = link.type.replaceAll("_", " ");
    const fontSize = Math.max(7, Math.min(10, 9 / globalScale));
    const x = source.x + (target.x - source.x) * 0.5;
    const y = source.y + (target.y - source.y) * 0.5;
    ctx.save();
    ctx.font = `500 ${fontSize}px ${GRAPH_LABEL_FONT}`;
    const width = ctx.measureText(label).width;
    const padX = 4;
    const padY = 2;
    ctx.fillStyle = hexToRgba("#f8fafc", 0.92);
    ctx.fillRect(x - width / 2 - padX, y - fontSize, width + padX * 2, fontSize + padY * 2);
    ctx.strokeStyle = hexToRgba("#cbd5e1", 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2 - padX, y - fontSize, width + padX * 2, fontSize + padY * 2);
    ctx.fillStyle = "#334155";
    ctx.fillText(label, x - width / 2, y + 1);
    ctx.restore();
  }

  function handleNodeDoubleClick(node: RenderNode) {
    const meta = node.meta ?? {};
    if (node.type === "fund") {
      const fundSlug = typeof meta.slug === "string" && meta.slug ? meta.slug : undefined;
      const nodeFundId = typeof meta.fundId === "string" && meta.fundId ? meta.fundId : node.id.replace(/^fund:/, "");
      router.push(`/cerebrosfund/funds/${fundSlug ?? nodeFundId}`);
      return;
    }

    if (node.type === "company") {
      const relatedFundSlug = typeof meta.relatedFundSlug === "string" ? meta.relatedFundSlug : undefined;
      const relatedFundId = typeof meta.relatedFundId === "string" ? meta.relatedFundId : undefined;
      if (relatedFundSlug || relatedFundId) {
        router.push(`/cerebrosfund/funds/${relatedFundSlug ?? relatedFundId}`);
      }
      return;
    }

    if (node.type === "source") {
      if (typeof meta.articleId === "string" && meta.articleId.trim()) {
        router.push(`/article/${meta.articleId}`);
        return;
      }
      if (typeof meta.url === "string" && meta.url.trim()) {
        window.open(meta.url, "_blank", "noopener,noreferrer");
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h1 className="text-xl font-semibold text-slate-900">{title ?? "Venture Intelligence Graph"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          2D neighborhood graph for funds, companies, claims, signals, and source evidence.
        </p>
        {tier === "visitor" || tier === "contributor" ? (
          <div className="mt-3">
            <UnlockBanner
              title={`Graph depth is capped at ${maxDepth} for ${tier}.`}
              detail="Unlock deeper neighborhoods and full node types by contributing."
            />
          </div>
        ) : null}
        <div className="mt-3">
          <GraphLegend />
        </div>
      </section>

      <GraphFilters
        search={search}
        onSearchChange={setSearch}
        nodeTypeEnabled={nodeTypeEnabled}
        onToggleType={(type) => setNodeTypeEnabled((prev) => ({ ...prev, [type]: !prev[type] }))}
        onApplyOverviewPreset={applyOverviewPreset}
        onlyVerified={onlyVerified}
        onToggleOnlyVerified={() => setOnlyVerified((prev) => !prev)}
        focusEnabled={focusEnabled}
        onToggleFocus={() => setFocusEnabled((prev) => !prev)}
        focusNodeId={focusNodeId}
        onFocusNodeChange={setFocusNodeId}
        focusOptions={focusOptions}
        depth={depth}
        onDepthChange={(nextDepth) => setDepth(Math.max(1, Math.min(maxDepth, nextDepth)))}
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div ref={canvasWrapRef} className="relative h-[66vh] min-h-[420px] w-full overflow-hidden rounded-xl bg-slate-50">
            {requestError ? (
              <div className="flex h-full items-center justify-center text-sm text-rose-700">{requestError}</div>
            ) : loading && !renderGraphData.nodes.length ? (
              <div className="h-full animate-pulse p-5">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="mt-4 h-[75%] w-full rounded-xl bg-slate-200/80" />
                <div className="mt-4 h-3 w-64 rounded bg-slate-200" />
              </div>
            ) : (
              <ForceGraph2D
                ref={graphRef}
                width={size.width}
                height={size.height}
                graphData={renderGraphData}
                backgroundColor="#f8fafc"
                linkColor={(link: RenderLink) => linkColor(link)}
                linkWidth={(link: RenderLink) => {
                  const base = Math.max(1, Math.min(3.2, (link.weight ?? 0.6) * 2.4));
                  if (linkIsPrimary(link)) return base + 1;
                  if (hoveredLinkKey && linkKey(link) !== hoveredLinkKey) return Math.max(0.8, base * 0.75);
                  return base;
                }}
                linkDirectionalArrowLength={(link: RenderLink) => (linkIsPrimary(link) ? 6 : 4)}
                linkDirectionalArrowRelPos={0.96}
                linkDirectionalArrowColor={(link: RenderLink) => linkColor(link)}
                nodeCanvasObject={(nodeRaw: unknown, ctx: CanvasRenderingContext2D, globalScale: number) =>
                  drawNodeCanvas(nodeRaw as RenderNode, ctx, globalScale)
                }
                nodeCanvasObjectMode={() => "replace"}
                nodePointerAreaPaint={(nodeRaw: unknown, color: string, ctx: CanvasRenderingContext2D) => {
                  const node = nodeRaw as RenderNode;
                  const x = typeof node.x === "number" ? node.x : 0;
                  const y = typeof node.y === "number" ? node.y : 0;
                  const radius = nodeSize(node) + 3;
                  ctx.fillStyle = color;
                  drawNodeShape(ctx, node.type, x, y, radius);
                  ctx.fill();
                }}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={(linkRaw: unknown, ctx: CanvasRenderingContext2D, globalScale: number) =>
                  drawLinkLabel(linkRaw as RenderLink, ctx, globalScale)
                }
                nodeColor={(nodeRaw: unknown) => {
                  const node = nodeRaw as RenderNode;
                  const baseHex = node.id === selectedNodeId ? "#0f172a" : GRAPH_NODE_COLORS[node.type];
                  return hexToRgba(baseHex, nodeOpacity(node));
                }}
                nodeVal={nodeSize}
                nodeLabel={(nodeRaw: unknown) => tooltipText(nodeRaw as RenderNode)}
                onNodeClick={(nodeRaw: unknown) => {
                  const node = nodeRaw as RenderNode;
                  setSelectedNodeId(node.id);
                  setHoveredLinkKey(null);
                  if (typeof node.x === "number" && typeof node.y === "number") {
                    graphRef.current?.centerAt(node.x, node.y, 450);
                    graphRef.current?.zoom(2.35, 450);
                  }
                }}
                onNodeDoubleClick={(nodeRaw: unknown) => handleNodeDoubleClick(nodeRaw as RenderNode)}
                onLinkHover={(linkRaw: unknown) => {
                  if (!linkRaw) {
                    setHoveredLinkKey(null);
                    return;
                  }
                  setHoveredLinkKey(linkKey(linkRaw as RenderLink));
                }}
                onBackgroundClick={() => {
                  setSelectedNodeId("");
                  setHoveredLinkKey(null);
                }}
                warmupTicks={80}
                cooldownTicks={240}
                d3AlphaDecay={0.045}
                d3VelocityDecay={0.24}
                onEngineStop={() => {
                  setLayoutStable(true);
                  if (!focusEnabled && autoFittedKeyRef.current !== autoFitKey) {
                    fitToNodeSet(defaultViewNodeIds, 520);
                    autoFittedKeyRef.current = autoFitKey;
                  }
                }}
              />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Showing {filteredGraph.nodes.length} nodes / {filteredGraph.links.length} links
            </span>
            <div className="flex items-center gap-2">
              {selectionActive ? (
                <button
                  type="button"
                  onClick={() => setSelectedNodeId("")}
                  className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Show full graph
                </button>
              ) : null}
              <span>
                {loading
                  ? "Refreshing graph..."
                  : !focusEnabled && !search.trim()
                    ? "Overview preset active"
                    : layoutStable
                      ? "Layout stabilized"
                      : `Mode: ${graph.mode}`}
              </span>
            </div>
          </div>
        </div>

        <GraphDetailsPanel node={selectedNode} relatedNodes={relatedNodes} onRefresh={refreshGraph} />
      </section>
    </div>
  );
}
