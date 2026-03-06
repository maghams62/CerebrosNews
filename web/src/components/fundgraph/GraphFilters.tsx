import { GraphNodeType } from "@/lib/fundgraph/graphTypes";

const FILTER_ORDER: GraphNodeType[] = ["fund", "company", "claim", "signal", "source", "person"];

function title(type: GraphNodeType): string {
  if (type === "fund") return "Funds";
  if (type === "company") return "Companies";
  if (type === "claim") return "Claims";
  if (type === "signal") return "Signals";
  if (type === "source") return "Sources";
  return "People";
}

export function GraphFilters({
  search,
  onSearchChange,
  nodeTypeEnabled,
  onToggleType,
  onApplyOverviewPreset,
  onlyVerified,
  onToggleOnlyVerified,
  focusEnabled,
  onToggleFocus,
  focusNodeId,
  onFocusNodeChange,
  focusOptions,
  depth,
  onDepthChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  nodeTypeEnabled: Record<GraphNodeType, boolean>;
  onToggleType: (type: GraphNodeType) => void;
  onApplyOverviewPreset: () => void;
  onlyVerified: boolean;
  onToggleOnlyVerified: () => void;
  focusEnabled: boolean;
  onToggleFocus: () => void;
  focusNodeId: string;
  onFocusNodeChange: (value: string) => void;
  focusOptions: Array<{ id: string; label: string; type: GraphNodeType }>;
  depth: number;
  onDepthChange: (depth: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <label className="block">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find fund, company, claim, source"
            className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Focus</span>
            <select
              value={focusNodeId}
              onChange={(event) => onFocusNodeChange(event.target.value)}
              className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="">None</option>
              {focusOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.type})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Hops</span>
            <select
              value={depth}
              onChange={(event) => onDepthChange(Number(event.target.value))}
              disabled={!focusEnabled || !focusNodeId}
              className="mt-1 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none disabled:opacity-60"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>

          <button
            type="button"
            onClick={onToggleFocus}
            className={`h-9 rounded-xl border px-3 text-xs font-semibold uppercase ${
              focusEnabled ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Focus
          </button>

          <button
            type="button"
            onClick={onToggleOnlyVerified}
            className={`h-9 rounded-xl border px-3 text-xs font-semibold uppercase ${
              onlyVerified ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Only Verified
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApplyOverviewPreset}
          className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white uppercase"
        >
          Overview Preset
        </button>
        {FILTER_ORDER.map((type) => {
          const active = nodeTypeEnabled[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase ${
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {title(type)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
