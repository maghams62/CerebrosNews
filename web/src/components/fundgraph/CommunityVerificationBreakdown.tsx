"use client";

import { ClaimVerificationRecord } from "@/fundgraph/types";

function prettyTier(tier: string): string {
  return tier.toLowerCase().split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

export function CommunityVerificationBreakdown({ record }: { record: ClaimVerificationRecord }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
          Verify: <span className="font-semibold text-slate-900">{record.community.verifyCount}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
          Dispute: <span className="font-semibold text-slate-900">{record.community.disputeCount}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Weighted verify {record.community.weightedVerifyScore.toFixed(2)} / weighted dispute {record.community.weightedDisputeScore.toFixed(2)}
      </p>
      {record.community.topVerifierTiers.length ? (
        <p className="mt-1 text-xs text-slate-600">
          Top verifier tiers: {record.community.topVerifierTiers.map(prettyTier).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
