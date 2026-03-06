"use client";

export function PreferenceSummaryCard({
  summary,
  chips,
  syncLabel,
}: {
  summary: string;
  chips: string[];
  syncLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Preference Summary</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {syncLabel}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.length ? (
          chips.map((chip) => (
            <span key={chip} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {chip}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">No active preference tags saved yet.</span>
        )}
      </div>
    </section>
  );
}
