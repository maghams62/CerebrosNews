import { createId } from "@/lib/fundgraph/ids";
import { markdownToEditorHtml } from "@/lib/fundgraph/memoEditor";
import {
  addClaimEvidence as addClaimEvidenceInternal,
  addMemo as addMemoInternal,
  addSource as addSourceInternal,
  getClaimVerificationRecord as getClaimVerificationRecordInternal,
  getClaimLinksForClaim,
  getMemoById as getMemoByIdInternal,
  getSourceById as getSourceByIdInternal,
  getSources as getSourcesInternal,
  listMemos as listMemosInternal,
  setClaimLinks as setClaimLinksInternal,
  updateMemoById as updateMemoByIdInternal,
} from "@/lib/fundgraph/store";
import { ClaimEvidence, ClaimLink, ClaimVerificationRecord, Memo, Source } from "@/lib/fundgraph/types";

export async function addSource(source: Source): Promise<Source> {
  return addSourceInternal(source);
}

export async function getSourceById(sourceId: string): Promise<Source | null> {
  return getSourceByIdInternal(sourceId);
}

export async function listSources(limit?: number): Promise<Source[]> {
  return getSourcesInternal(limit);
}

export async function setClaimLinks(claimId: string, links: ClaimLink[]): Promise<void> {
  await setClaimLinksInternal(claimId, links);
}

export async function getLinksForClaim(claimId: string): Promise<ClaimLink[]> {
  return getClaimLinksForClaim(claimId);
}

export async function getClaimVerificationRecord(claimId: string): Promise<ClaimVerificationRecord | null> {
  return getClaimVerificationRecordInternal(claimId);
}

export async function addClaimEvidence(input: { claimId: string; evidence: ClaimEvidence }) {
  return addClaimEvidenceInternal(input);
}

export async function addMemo(memo: Memo): Promise<Memo> {
  const normalizedEditorHtml = memo.editorHtml?.trim() ? memo.editorHtml : markdownToEditorHtml(memo.memoMarkdown ?? "");
  const normalized: Memo = {
    ...memo,
    id: memo.id || createId("fg-memo"),
    artifactType: memo.artifactType ?? "fund_memo",
    generationMode: memo.generationMode ?? "deterministic",
    primaryFundId: memo.primaryFundId ?? memo.fundIds[0],
    fundIds: Array.from(new Set(memo.fundIds)),
    editorHtml: normalizedEditorHtml,
    isEdited: memo.isEdited ?? false,
    createdAt: memo.createdAt || new Date().toISOString(),
  };
  await addMemoInternal(normalized);
  return normalized;
}

export async function getMemoById(memoId: string): Promise<Memo | null> {
  return getMemoByIdInternal(memoId);
}

export async function listMemos(limit?: number): Promise<Memo[]> {
  return listMemosInternal(limit);
}

export async function updateMemoById(memoId: string, patch: Partial<Memo>): Promise<Memo | null> {
  return updateMemoByIdInternal(memoId, patch);
}
