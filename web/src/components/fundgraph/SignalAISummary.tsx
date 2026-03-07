"use client";

import { useMemo } from "react";
import { SectionHelpTooltip } from "@/components/fundgraph/SectionHelpTooltip";
import { SignalReport } from "@/components/fundgraph/signalReportTypes";

function CitationChip({
  label,
  citationId,
  onClick,
}: {
  label: string;
  citationId: string;
  onClick: (citationId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(citationId)}
      className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

export function SignalAISummary({
  assertion,
  aiSummary,
  evidence,
  onCitationClick,
  compact = false,
}: {
  assertion: string;
  aiSummary: SignalReport["ai_summary"];
  evidence: SignalReport["evidence"];
  onCitationClick: (citationId: string) => void;
  compact?: boolean;
}) {
  const titleByCitation = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of evidence) {
      map.set(item.id, item.source_type);
    }
    return map;
  }, [evidence]);
  const uniqueEvidence = useMemo(() => {
    const seen = new Set<string>();
    return evidence.filter((item) => {
      const key = `${item.id}|${(item.url || "").trim().toLowerCase()}|${item.snippet.trim().toLowerCase().slice(0, 220)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [evidence]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
        {compact ? "AI Quick Take" : "AI Summary"}
        <SectionHelpTooltip
          text="Short AI synthesis of what this signal claims and how strongly current evidence supports it."
          ariaLabel="What this AI summary section shows"
        />
      </h3>
      {compact ? (
        <>
          <p className="mt-2 text-sm text-slate-700">{aiSummary.summary_paragraph}</p>
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
            {aiSummary.bullet_justifications.slice(0, 3).map((item, index) => (
              <li key={`quick-take-${index + 1}`}>{item}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {uniqueEvidence.slice(0, 1).map((item, index) => (
              <CitationChip key={`header-${item.id}-${index + 1}`} citationId={item.id} label={item.source_type} onClick={onCitationClick} />
            ))}
            {!uniqueEvidence.length ? <span className="text-xs text-slate-500">No citations available.</span> : null}
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Assertion:</span> {assertion}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Evidence used:</span>
            {uniqueEvidence.slice(0, 4).map((item, index) => (
              <CitationChip key={`header-${item.id}-${index + 1}`} citationId={item.id} label={item.id} onClick={onCitationClick} />
            ))}
            {!uniqueEvidence.length ? <span className="text-slate-500">No citations available.</span> : null}
          </div>
          <p className="mt-2 text-sm text-slate-700">{aiSummary.summary_paragraph}</p>
        </>
      )}

      {!compact ? (
        <>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
            {aiSummary.bullet_justifications.map((item, index) => (
              <li key={`justification-${index + 1}`}>{item}</li>
            ))}
          </ul>

          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Assertion Reasoning Trace</summary>
            <div className="mt-3 space-y-3">
              {aiSummary.reasoning_trace.map((step) => (
                <article key={`step-${step.step_num}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">
                    Step {step.step_num}: {step.action}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{step.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Array.from(new Set(step.citations)).map((citationId, index) => (
                      <CitationChip
                        key={`${step.step_num}-${citationId}-${index + 1}`}
                        citationId={citationId}
                        label={titleByCitation.get(citationId) ? `${citationId} · ${titleByCitation.get(citationId)}` : citationId}
                        onClick={onCitationClick}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </details>
        </>
      ) : null}

      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <span className="font-semibold">Conclusion:</span> {aiSummary.conclusion.verdict} with confidence {aiSummary.conclusion.confidence}.
        {aiSummary.conclusion.notes ? <span> {aiSummary.conclusion.notes}</span> : null}
      </div>
    </section>
  );
}
