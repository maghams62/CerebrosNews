import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { addClaimEvidence, addSource } from "@/lib/fundgraph/store.contract";
import {
  ContributorRole,
  EvidenceConfidenceTier,
  EvidenceSourceType,
  EvidenceVisibility,
  MembershipTier,
  Source,
  SourceType,
} from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const evidenceSourceValues: [EvidenceSourceType, ...EvidenceSourceType[]] = [
  "PUBLIC_ARTICLE",
  "TWEET_THREAD",
  "PODCAST",
  "YOUTUBE_VIDEO",
  "PASTED_TEXT",
  "PRIVATE_INTEL",
  "FOUNDER_NOTE",
  "LP_NOTE",
  "GP_NOTE",
  "FUND_DECK",
  "OTHER",
];

const visibilityValues: [EvidenceVisibility, ...EvidenceVisibility[]] = ["PUBLIC", "PRIVATE", "ANONYMOUS"];
const tierValues: [MembershipTier, ...MembershipTier[]] = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "INTERNAL_ANALYST",
  "VERIFIED_PARTNER",
];
const roleValues: [ContributorRole, ...ContributorRole[]] = [
  "ANONYMOUS_FOUNDER",
  "ANONYMOUS_SERIES_B_INVESTOR",
  "ANONYMOUS_GP",
  "ANONYMOUS_LP",
  "OPERATOR",
  "ANALYST",
  "MEMBER",
  "OTHER",
];
const confidenceValues: [EvidenceConfidenceTier, ...EvidenceConfidenceTier[]] = ["LOW", "MEDIUM", "HIGH"];

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  sourceType: z.enum(evidenceSourceValues),
  visibility: z.enum(visibilityValues),
  title: z.string().trim().max(280).optional(),
  url: z.string().url().max(2000).optional(),
  snippet: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
  confidence: z.enum(confidenceValues).optional(),
  contributor: z
    .object({
      label: z.string().trim().max(120).optional(),
      role: z.enum(roleValues).optional(),
      tier: z.enum(tierValues).optional(),
      isAnonymous: z.boolean().optional(),
    })
    .optional(),
});

function toSourceType(type: EvidenceSourceType): SourceType {
  if (type === "PUBLIC_ARTICLE") return "NEWS_ARTICLE";
  if (type === "TWEET_THREAD") return "TWEET_THREAD_TEXT";
  if (type === "FUND_DECK") return "PDF_TEXT";
  return "PASTED_TEXT";
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const { id } = await context.params;
  const now = new Date().toISOString();

  const evidenceId = createId("fg-claim-evidence");
  const updated = await addClaimEvidence({
    claimId: id,
    evidence: {
      id: evidenceId,
      claimId: id,
      sourceType: parsed.data.sourceType,
      visibility: parsed.data.visibility,
      title: parsed.data.title,
      url: parsed.data.url,
      snippet: parsed.data.snippet,
      note: parsed.data.note,
      submittedAt: now,
      contributor: parsed.data.contributor,
      confidence: parsed.data.confidence,
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  let sourceIdForReward = evidenceId;
  if (parsed.data.url || parsed.data.snippet || parsed.data.note) {
    const source: Source = {
      id: createId("fg-source"),
      type: toSourceType(parsed.data.sourceType),
      title: parsed.data.title || `Claim evidence · ${id}`,
      url: parsed.data.url,
      rawText: parsed.data.snippet || parsed.data.note || "",
      createdAt: now,
      metadata: {
        claimId: id,
        evidenceId,
        visibility: parsed.data.visibility,
        sourceType: parsed.data.sourceType,
      },
    };
    await addSource(source);
    sourceIdForReward = source.id;
  }
  const gamification = await applyContribution(userId, "add_source", sourceIdForReward);

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    claim: updated,
    verificationRecord: updated.verificationRecord,
    gamification,
    verificationSummary: {
      status: updated.verificationRecord?.status ?? "UNVERIFIED",
      finalScore: updated.verificationRecord?.score.finalScore ?? 0,
      confidenceTier: updated.verificationRecord?.score.confidenceTier ?? "LOW",
      publicEvidenceCount: updated.verificationRecord?.evidence.filter((item) => item.visibility === "PUBLIC").length ?? 0,
      privateEvidenceCount: updated.verificationRecord?.evidence.filter((item) => item.visibility !== "PUBLIC").length ?? 0,
      verifyCount: updated.verificationRecord?.community.verifyCount ?? 0,
      disputeCount: updated.verificationRecord?.community.disputeCount ?? 0,
    },
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
