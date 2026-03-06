"use client";

import { ClaimEvidence } from "@/fundgraph/types";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";

function titleCase(input: string): string {
  return input.toLowerCase().split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

export function EvidenceTrailCard({ evidence }: { evidence: ClaimEvidence }) {
  const contributorLabel =
    evidence.contributor?.label ||
    (evidence.contributor?.isAnonymous
      ? titleCase(evidence.contributor?.role ?? "ANONYMOUS_MEMBER")
      : evidence.contributor?.tier
        ? `${titleCase(evidence.contributor.tier)} member`
        : "Community member");

  return (
    <article className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {titleCase(evidence.sourceType)}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {titleCase(evidence.visibility)}
        </span>
        {evidence.confidence ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {titleCase(evidence.confidence)}
          </span>
        ) : null}
      </div>
      {evidence.title ? <p className="mt-2 text-sm font-semibold text-slate-900">{evidence.title}</p> : null}
      {evidence.snippet ? <p className="mt-1 text-sm text-slate-700">&quot;{evidence.snippet}&quot;</p> : null}
      {evidence.note ? <p className="mt-1 text-sm text-slate-600">{evidence.note}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Submitted by {contributorLabel}</span>
        <span>•</span>
        <span>{relativeTimeFromIso(evidence.submittedAt)}</span>
      </div>
      {evidence.url ? (
        <a href={evidence.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900">
          Open source ↗
        </a>
      ) : null}
    </article>
  );
}
