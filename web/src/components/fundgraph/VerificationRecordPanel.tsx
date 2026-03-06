"use client";

import { useState } from "react";
import { AddSourceModal } from "@/components/fundgraph/AddSourceModal";
import { CommunityVerificationBreakdown } from "@/components/fundgraph/CommunityVerificationBreakdown";
import { DisputeClaimModal } from "@/components/fundgraph/DisputeClaimModal";
import { EvidenceTrailCard } from "@/components/fundgraph/EvidenceTrailCard";
import { VerificationScoreBreakdown } from "@/components/fundgraph/VerificationScoreBreakdown";
import { ClaimVerificationRecord, EvidenceConfidenceTier, EvidenceSourceType, EvidenceVisibility, NewsClaim } from "@/fundgraph/types";
import { scoreClass, verificationStatusClass, verificationStatusLabel } from "@/components/fundgraph/verificationUi";
import { CREDIT_DELTAS } from "@/lib/fundgraph/gamification.shared";

type AddSourcePayload = {
  sourceType: EvidenceSourceType;
  visibility: EvidenceVisibility;
  title?: string;
  url?: string;
  snippet?: string;
  note?: string;
  confidence?: EvidenceConfidenceTier;
};

function formatDateTime(iso?: string): string {
  if (!iso) return "N/A";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return value.toLocaleString();
}

export function VerificationRecordPanel({
  open,
  claim,
  record,
  loading,
  actionBusy,
  error,
  onClose,
  onVerify,
  onDispute,
  onAddSource,
}: {
  open: boolean;
  claim: NewsClaim;
  record?: ClaimVerificationRecord | null;
  loading?: boolean;
  actionBusy?: "verify" | "dispute" | "add_source" | null;
  error?: string | null;
  onClose: () => void;
  onVerify: () => Promise<void> | void;
  onDispute: (payload: { note: string; sourceUrl?: string; sourceSnippet?: string }) => Promise<void> | void;
  onAddSource: (payload: AddSourcePayload) => Promise<void>;
}) {
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-start justify-center">
          <aside className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Verification Record</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Loading verification...</div>
        ) : null}

        {!loading && record ? (
          <div className="mt-4 space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Claim</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{claim.claimText}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2.5 py-1 font-semibold ${verificationStatusClass(record.status)}`}>
                  {verificationStatusLabel(record.status)}
                </span>
                <span className={`rounded-full bg-slate-100 px-2.5 py-1 font-semibold ${scoreClass(record.score.finalScore)}`}>
                  Confidence {Math.round(record.score.finalScore)} / 100
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                  Updated {formatDateTime(record.updatedAt)}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Verification Breakdown</p>
              <div className="mt-2">
                <VerificationScoreBreakdown record={record} />
              </div>
            </section>

            <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Machine Analysis</p>
              <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <p>
                  Citation support <span className="font-semibold text-slate-900">{record.machine.citationSupport}</span>
                </p>
                <p>
                  Source relevance <span className="font-semibold text-slate-900">{record.machine.sourceRelevance}</span>
                </p>
                <p>
                  Freshness <span className="font-semibold text-slate-900">{record.machine.freshness}</span>
                </p>
                <p>
                  Conflicts detected <span className="font-semibold text-slate-900">{record.machine.conflictDetected ? "Yes" : "No"}</span>
                </p>
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{record.machine.reasoningSummary}</p>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Evidence Trail</p>
              {record.evidence.map((item) => (
                <EvidenceTrailCard key={item.id} evidence={item} />
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Community Verification</p>
              <div className="mt-2">
                <CommunityVerificationBreakdown record={record} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() => onVerify()}
                  className="h-9 rounded-full bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {actionBusy === "verify" ? "Verifying..." : `Verify (+${CREDIT_DELTAS.verify_claim} tokens)`}
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() => setDisputeOpen(true)}
                  className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {actionBusy === "dispute" ? "Submitting..." : `Dispute (+${CREDIT_DELTAS.verify_claim} tokens)`}
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() => setAddSourceOpen(true)}
                  className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Add source (+{CREDIT_DELTAS.add_source} tokens)
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-600">Token rewards are granted for quality verification and source contributions.</p>
            </section>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-rose-700">{error}</p> : null}
          </aside>
        </div>
      </div>

      <AddSourceModal
        open={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        submitting={actionBusy === "add_source"}
        onSubmit={onAddSource}
      />
      <DisputeClaimModal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        submitting={actionBusy === "dispute"}
        onSubmit={async (payload) => {
          await onDispute(payload);
          setDisputeOpen(false);
        }}
      />
    </div>
  );
}
