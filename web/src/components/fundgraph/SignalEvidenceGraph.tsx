"use client";

import { SignalReport } from "@/components/fundgraph/signalReportTypes";

const NODE_COLORS: Record<SignalReport["graph"]["nodes"][number]["type"], string> = {
  signal: "#0f172a",
  evidence: "#0ea5e9",
  entity: "#10b981",
};

function layoutNodes(nodes: SignalReport["graph"]["nodes"]) {
  const signalNode = nodes.find((node) => node.type === "signal");
  const others = nodes.filter((node) => node.id !== signalNode?.id).slice(0, 29);
  const center = { x: 320, y: 170 };
  const radius = 112;

  const positions = new Map<string, { x: number; y: number }>();
  if (signalNode) {
    positions.set(signalNode.id, center);
  }

  others.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, others.length);
    positions.set(node.id, {
      x: center.x + Math.cos(angle) * radius + (index % 3 === 0 ? 20 : -20),
      y: center.y + Math.sin(angle) * radius,
    });
  });

  return positions;
}

export function SignalEvidenceGraph({
  graph,
  activeNodeId,
  onNodeClick,
}: {
  graph: SignalReport["graph"];
  activeNodeId?: string | null;
  onNodeClick: (node: SignalReport["graph"]["nodes"][number]) => void;
}) {
  const positions = layoutNodes(graph.nodes);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Evidence Graph</h3>
      <p className="mt-1 text-xs text-slate-600">Signal node center + sources/entities. Click a node to focus related evidence.</p>

      <svg viewBox="0 0 640 330" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50">
        {graph.edges.map((edge) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          const tone = edge.label === "CONTRADICTS" ? "#dc2626" : edge.label === "SUPPORTED_BY" ? "#0369a1" : "#166534";
          return (
            <g key={edge.id}>
              <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={tone} strokeOpacity={0.6} strokeWidth={1.5} />
              <text x={midX} y={midY} fill={tone} fontSize={10} textAnchor="middle">
                {edge.label}
              </text>
            </g>
          );
        })}

        {graph.nodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          const active = activeNodeId === node.id;
          const radius = node.type === "signal" ? 18 : 12;
          return (
            <g
              key={node.id}
              onClick={() => onNodeClick(node)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onNodeClick(node);
                }
              }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                fill={NODE_COLORS[node.type]}
                stroke={active ? "#f59e0b" : "#ffffff"}
                strokeWidth={active ? 3 : 1.5}
              />
              <text x={point.x} y={point.y + radius + 12} fill="#334155" fontSize={10} textAnchor="middle">
                {node.label.slice(0, 14)}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
