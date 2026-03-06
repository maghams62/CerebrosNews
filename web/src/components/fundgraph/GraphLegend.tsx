import { GRAPH_NODE_COLORS, GraphNodeType } from "@/lib/fundgraph/graphTypes";

const NODE_ORDER: GraphNodeType[] = ["fund", "company", "person", "claim", "source", "signal"];

function labelForType(type: GraphNodeType): string {
  if (type === "fund") return "Fund";
  if (type === "company") return "Company";
  if (type === "claim") return "Claim";
  if (type === "source") return "Source";
  if (type === "signal") return "Signal";
  if (type === "person") return "Person";
  return "Entity";
}

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {NODE_ORDER.map((type) => (
        <div key={type} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GRAPH_NODE_COLORS[type] }} />
          <span className="font-semibold">{labelForType(type)}</span>
        </div>
      ))}
    </div>
  );
}
