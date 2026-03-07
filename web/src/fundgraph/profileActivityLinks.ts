import { ContributionEventType } from "@/lib/fundgraph/types";

export type ProfileActivityLinkContext = {
  fundNameById: Record<string, string>;
  signalTitleById: Map<string, string>;
  claimTextById: Map<string, string>;
  memoIdSet: Set<string>;
};

export type ProfileActivityLink = {
  href: string | null;
  targetLabel: string | null;
};

function extractScopedId(targetId: string, scope: "fund" | "signal" | "claim" | "memo"): string | null {
  const match = targetId.match(new RegExp(`${scope}:([^:|,]+)`));
  return match?.[1]?.trim() || null;
}

function shorten(value: string, max = 72): string {
  const clean = value.trim();
  if (!clean) return clean;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}\u2026`;
}

function signalHref(signalId: string, addCitationComposer = false): string {
  const params = new URLSearchParams();
  params.set("signalId", signalId);
  if (addCitationComposer) params.set("quickAction", "addCitation");
  const encodedId = encodeURIComponent(signalId);
  return `/cerebrosfund/signals?${params.toString()}#signal-${encodedId}`;
}

function claimHref(claimId: string): string {
  return `/cerebrosfund/graph?claimId=${encodeURIComponent(claimId)}`;
}

function resolveSignalId(type: ContributionEventType | string, targetId: string, signalTitleById: Map<string, string>): string | null {
  const scoped = extractScopedId(targetId, "signal");
  if (scoped) return scoped;
  if (signalTitleById.has(targetId)) return targetId;
  if (type === "add_signal" || type === "share_signal" || type === "upvote") return targetId;
  if (type === "verify_claim" && (targetId.startsWith("signal-") || targetId.startsWith("fg-signal-"))) return targetId;
  return null;
}

function resolveClaimId(type: ContributionEventType | string, targetId: string, claimTextById: Map<string, string>): string | null {
  const scoped = extractScopedId(targetId, "claim");
  if (scoped) return scoped;
  if (claimTextById.has(targetId)) return targetId;
  if (type === "verify_claim" && (targetId.startsWith("claim-") || targetId.startsWith("fg-claim-"))) return targetId;
  return null;
}

export function resolveProfileActivityLink(
  type: ContributionEventType | string,
  targetIdInput: string | null | undefined,
  context: ProfileActivityLinkContext
): ProfileActivityLink {
  const targetId = String(targetIdInput || "").trim();

  if (targetId) {
    const signalId = resolveSignalId(type, targetId, context.signalTitleById);
    if (signalId) {
      const signalTitle = context.signalTitleById.get(signalId);
      const addCitationComposer = type === "add_source";
      return {
        href: signalHref(signalId, addCitationComposer),
        targetLabel: signalTitle ? shorten(signalTitle) : "Open signal",
      };
    }

    const claimId = resolveClaimId(type, targetId, context.claimTextById);
    if (claimId && (type === "verify_claim" || type === "add_source")) {
      const claimText = context.claimTextById.get(claimId);
      return {
        href: claimHref(claimId),
        targetLabel: claimText ? `Claim: ${shorten(claimText, 56)}` : "Open claim graph",
      };
    }

    const fundId = extractScopedId(targetId, "fund");
    if (fundId && type === "add_comment") {
      return {
        href: `/cerebrosfund/funds/${encodeURIComponent(fundId)}#fund-discussion`,
        targetLabel: context.fundNameById[fundId] ? `Fund discussion: ${context.fundNameById[fundId]}` : "Open fund discussion",
      };
    }

    const memoId = extractScopedId(targetId, "memo") || (context.memoIdSet.has(targetId) ? targetId : null);
    if (memoId && type === "memo_generate") {
      return {
        href: `/cerebrosfund/memos/${encodeURIComponent(memoId)}`,
        targetLabel: "Open memo",
      };
    }
  }

  if (type === "add_signal" || type === "share_signal" || type === "upvote" || type === "add_source") {
    return { href: "/cerebrosfund/signals", targetLabel: "Open signals feed" };
  }
  if (type === "verify_claim") {
    return { href: "/cerebrosfund/claims", targetLabel: "Open claims" };
  }
  if (type === "add_comment") {
    return { href: "/cerebrosfund/funds", targetLabel: "Open funds" };
  }
  if (type === "memo_generate") {
    return { href: "/cerebrosfund/profile#my-memos", targetLabel: "Open memos" };
  }
  return { href: null, targetLabel: null };
}
