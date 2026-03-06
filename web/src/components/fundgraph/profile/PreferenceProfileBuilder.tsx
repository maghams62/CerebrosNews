"use client";

import { FundCategory, FundStage, RiskTolerance, UserProfile } from "@/fundgraph/types";

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

export function PreferenceProfileBuilder({
  draft,
  sectors,
  stages,
  geos,
  loading,
  saving,
  error,
  narrative,
  draftChips,
  onToggleSector,
  onToggleStage,
  onToggleGeo,
  onSetRisk,
  onSetCheckMin,
  onSetCheckMax,
  onSave,
  onReset,
}: {
  draft: UserProfile;
  sectors: FundCategory[];
  stages: FundStage[];
  geos: string[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  narrative: string;
  draftChips: string[];
  onToggleSector: (sector: FundCategory) => void;
  onToggleStage: (stage: FundStage) => void;
  onToggleGeo: (geo: string) => void;
  onSetRisk: (risk: RiskTolerance) => void;
  onSetCheckMin: (value: number) => void;
  onSetCheckMax: (value: number) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Investment Preference Profile</h2>
      <p className="mt-1 text-sm text-slate-600">Used to tune your Signals feed, For You cockpit, and fund recommendations.</p>
      {loading ? <p className="mt-2 text-sm text-slate-500">Loading preference profile...</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Investment Focus</p>

          <div className="mt-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Sectors</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sectors.map((sector) => (
                <ToggleChip key={sector} active={draft.sectorFocus.includes(sector)} label={sector} onClick={() => onToggleSector(sector)} />
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Stages</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {stages.map((stage) => (
                <ToggleChip key={stage} active={draft.stageFocus.includes(stage)} label={stage} onClick={() => onToggleStage(stage)} />
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Geographies</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {geos.map((geo) => (
                <ToggleChip key={geo} active={draft.geographies.includes(geo)} label={geo} onClick={() => onToggleGeo(geo)} />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Risk & Sizing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["low", "medium", "high"] as RiskTolerance[]).map((risk) => (
              <ToggleChip key={risk} active={draft.riskTolerance === risk} label={risk} onClick={() => onSetRisk(risk)} />
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Min Check ($M)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.checkSizeMinM}
                onChange={(event) => onSetCheckMin(Number(event.target.value) || 0)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Max Check ($M)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.checkSizeMaxM}
                onChange={(event) => onSetCheckMax(Number(event.target.value) || 0)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Active Profile Summary</p>
          <p className="mt-2 text-sm text-slate-700">{narrative}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftChips.length ? (
              draftChips.map((chip) => (
                <span key={chip} className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {chip}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Add tags to activate profile personalization.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Preference Profile"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset Draft
        </button>
      </div>
    </section>
  );
}
