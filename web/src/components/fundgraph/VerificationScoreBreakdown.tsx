"use client";

import { ClaimVerificationRecord } from "@/fundgraph/types";

function row(label: string, value: number) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{Math.round(value)}</span>
    </div>
  );
}

export function VerificationScoreBreakdown({ record }: { record: ClaimVerificationRecord }) {
  return (
    <div className="space-y-2">
      {row("Machine analysis", record.score.machineScore)}
      {row("Public evidence", record.score.publicEvidenceScore)}
      {row("Private evidence", record.score.privateEvidenceScore)}
      {row("Community verification", record.score.communityScore)}
      {row("Reputation weighting", record.score.reputationScore)}
      {row("Final confidence", record.score.finalScore)}
    </div>
  );
}
