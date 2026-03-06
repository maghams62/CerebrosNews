import { GRAPH_ANALYZER_PRESETS } from "@/components/fundgraph/graphAnalyzer/presets";
import { GraphAnalyzerPresetId, GraphTimelineRange } from "@/components/fundgraph/graphAnalyzer/types";

const TIMELINE_OPTIONS: Array<{ id: GraphTimelineRange; label: string }> = [
  { id: "6M", label: "Last 6 months" },
  { id: "12M", label: "Last 12 months" },
  { id: "ALL", label: "All time" },
];

export function GraphPresetsPanel({
  selectedPresetId,
  onSelectPreset,
  timeline,
  onTimelineChange,
}: {
  selectedPresetId: GraphAnalyzerPresetId | null;
  onSelectPreset: (presetId: GraphAnalyzerPresetId) => void;
  timeline: GraphTimelineRange;
  onTimelineChange: (value: GraphTimelineRange) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Explore the ecosystem</p>
      <h1 className="mt-1 text-xl font-semibold text-slate-900">Graph Analyzer</h1>
      <p className="mt-1 text-sm text-slate-600">Choose an investigative view instead of a random graph cloud.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {GRAPH_ANALYZER_PRESETS.map((preset) => {
          const active = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <p className="text-sm font-semibold">{preset.title}</p>
              <p className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-600"}`}>{preset.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Timeline</span>
        {TIMELINE_OPTIONS.map((option) => {
          const active = timeline === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onTimelineChange(option.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
