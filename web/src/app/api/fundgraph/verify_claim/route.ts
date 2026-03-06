import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyClaimAction } from "@/lib/fundgraph/actions/verifyClaim";

export const runtime = "nodejs";

const requestSchema = z.object({
  claimId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
  userName: z.string().trim().min(1).max(120).optional(),
  vote: z.enum(["verify", "disagree", "dispute"]).optional(),
  disagree: z.boolean().optional(),
  comment: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const { claimId, userName, vote, disagree, comment } = parsed.data;
  const mappedVote = vote ?? (disagree ? "dispute" : "verify");
  const result = await verifyClaimAction({
    claimId,
    userId,
    userName,
    vote: mappedVote,
    note: comment,
    comment,
  });

  if ("error" in result) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  // Legacy shape compatibility for existing callers.
  return NextResponse.json({
    ...result,
    verdict: result.llmVerification?.verdict ?? "mixed",
    confidence: result.llmVerification?.confidence ?? ((result.machineVerification?.machineConfidence ?? 50) / 100),
    rationale: result.llmVerification?.rationale ?? result.machineVerification?.reasoningSummary ?? "Machine verification completed.",
    contributor: {
      ...result.contributor,
      cred: result.contributor.credScore,
      badge: result.contributor.badgeTier,
    },
  });
}
