"use client";

import { useEffect, useMemo } from "react";
import { SignalReport } from "@/components/fundgraph/signalReportTypes";
import { fieldLikeBullets, normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString();
}

function badgeTone(sourceType: string): string {
  if (sourceType.includes("PODCAST")) return "bg-violet-100 text-violet-700";
  if (sourceType.includes("TWITTER")) return "bg-sky-100 text-sky-700";
  if (sourceType.includes("NEWS")) return "bg-slate-100 text-slate-700";
  if (sourceType.includes("DATASET")) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function snippetBullets(snippet: string): string[] {
  const cleaned = normalizeFundgraphText(snippet, 800);
  return fieldLikeBullets(cleaned, 5);
}

export function SignalEvidenceList({
  evidence,
  focusedEvidenceId,
  maxItems,
  compact = false,
}: {
  evidence: SignalReport["evidence"];
  focusedEvidenceId?: string | null;
  maxItems?: number;
  compact?: boolean;
}) {
  const visibleEvidence = useMemo(
    () => (typeof maxItems === "number" ? evidence.slice(0, Math.max(1, maxItems)) : evidence),
    [evidence, maxItems]
  );

  useEffect(() => {
    if (!focusedEvidenceId) return;
    const card = document.getElementById(`signal-evidence-${focusedEvidenceId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedEvidenceId]);

  const corroborationText = useMemo(() => {
    if (!visibleEvidence.length) return "0 independent source types available";
    const uniqueSources = new Set(visibleEvidence.map((item) => item.source_type)).size;
    const extractedFacts = visibleEvidence.flatMap((item) => item.extracted_facts ?? []);
    const factFields = new Set(extractedFacts.map((fact) => fact.field)).size;
    return `${uniqueSources} independent source types confirm ${Math.max(1, factFields)} key claim dimensions`;
  }, [visibleEvidence]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Evidence & Citations</h3>
        {!compact ? (
          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            Corroboration map: {corroborationText}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {!visibleEvidence.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            No evidence citations are available for this signal yet.
          </div>
        ) : null}
        {visibleEvidence.map((item, index) => {
          const bullets = snippetBullets(item.snippet);
          const domEvidenceId = `${item.id}-${index + 1}`;
          return (
          <article
            key={domEvidenceId}
            id={`signal-evidence-${domEvidenceId}`}
            className={`rounded-xl border p-3 transition ${
              focusedEvidenceId === item.id
                ? "border-sky-300 bg-sky-50 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeTone(item.source_type)}`}>
                {item.source_type}
              </span>
              <span className="text-[11px] text-slate-500">{formatDate(item.published_at)}</span>
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
            {bullets.length >= 2 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {bullets.map((entry) => (
                  <li key={`${item.id}-${entry}`} className="break-words">
                    {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 break-words text-sm text-slate-700">{normalizeFundgraphText(item.snippet, 500)}</p>
            )}
            {!compact ? (
              <>
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Why used:</span> {item.why_used}
                </p>

                {item.extracted_facts?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.extracted_facts.slice(0, 4).map((fact) => (
                      <span key={`${item.id}-${fact.field}`} className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600">
                        {fact.field}: <span className="font-semibold text-slate-800">{fact.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                Open source ↗
              </a>
            ) : (
              <div className="mt-3 text-xs text-slate-500">Source URL unavailable.</div>
            )}
          </article>
          );
        })}
        {typeof maxItems === "number" && evidence.length > visibleEvidence.length ? (
          <p className="text-xs text-slate-500">
            Showing top {visibleEvidence.length} citations out of {evidence.length}.
          </p>
        ) : null}
      </div>
    </section>
  );
}
