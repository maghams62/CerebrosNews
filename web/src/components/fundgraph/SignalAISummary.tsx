"use client";

import { useMemo } from "react";
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{compact ? "AI Quick Take" : "AI Summary"}</h3>
      {compact ? (
        <>
          <p className="mt-2 text-sm text-slate-700">{aiSummary.summary_paragraph}</p>
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
            {aiSummary.bullet_justifications.slice(0, 3).map((item, index) => (
              <li key={`quick-take-${index + 1}`}>{item}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evidence.slice(0, 1).map((item) => (
              <CitationChip key={`header-${item.id}`} citationId={item.id} label={item.source_type} onClick={onCitationClick} />
            ))}
            {!evidence.length ? <span className="text-xs text-slate-500">No citations available.</span> : null}
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Assertion:</span> {assertion}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Evidence used:</span>
            {evidence.slice(0, 4).map((item) => (
              <CitationChip key={`header-${item.id}`} citationId={item.id} label={item.id} onClick={onCitationClick} />
            ))}
            {!evidence.length ? <span className="text-slate-500">No citations available.</span> : null}
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
                    {step.citations.map((citationId) => (
                      <CitationChip
                        key={`${step.step_num}-${citationId}`}
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
