"use client";

import { NewsClaim } from "@/fundgraph/types";

function statusClass(status: string): string {
  if (status === "VERIFIED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "PARTIALLY_VERIFIED") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "DISPUTED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function statusLabel(status: string): string {
  if (status === "PARTIALLY_VERIFIED") return "Partially Verified";
  if (status === "VERIFIED") return "Verified";
  if (status === "DISPUTED") return "Disputed";
  return "Unverified";
}

export function VerificationSummary({
  claim,
  onViewVerification,
}: {
  claim: NewsClaim;
  onViewVerification: () => void;
}) {
  const record = claim.verificationRecord;
  const status = record?.status ?? "UNVERIFIED";
  const finalScore = Math.round(record?.score.finalScore ?? 0);
  const publicEvidenceCount = record?.evidence.filter((item) => item.visibility === "PUBLIC").length ?? 0;
  const privateEvidenceCount = record?.evidence.filter((item) => item.visibility !== "PUBLIC").length ?? 0;
  const verifyCount = record?.community.verifyCount ?? claim.community.verifyCount ?? 0;
  const disputeCount = record?.community.disputeCount ?? claim.community.disagreeCount ?? 0;

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Verification Summary</div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <div>Confidence: <span className="font-semibold text-slate-900">{finalScore} / 100</span></div>
        <div>Public sources: <span className="font-semibold text-slate-900">{publicEvidenceCount}</span></div>
        <div>Private sources: <span className="font-semibold text-slate-900">{privateEvidenceCount}</span></div>
        <div>Verifications: <span className="font-semibold text-slate-900">{verifyCount}</span></div>
        <div>Disputes: <span className="font-semibold text-slate-900">{disputeCount}</span></div>
        <div>Tier: <span className="font-semibold text-slate-900">{record?.score.confidenceTier ?? "LOW"}</span></div>
      </div>
      <button
        type="button"
        onClick={onViewVerification}
        className="mt-3 inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        View Verification
      </button>
    </section>
  );
}
