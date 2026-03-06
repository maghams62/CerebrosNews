import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyClaimAction } from "@/lib/fundgraph/actions/verifyClaim";
import { ContributorRole, MembershipTier } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const contributorRoleValues: [ContributorRole, ...ContributorRole[]] = [
  "ANONYMOUS_FOUNDER",
  "ANONYMOUS_SERIES_B_INVESTOR",
  "ANONYMOUS_GP",
  "ANONYMOUS_LP",
  "OPERATOR",
  "ANALYST",
  "MEMBER",
  "OTHER",
];

const memberTierValues: [MembershipTier, ...MembershipTier[]] = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "INTERNAL_ANALYST",
  "VERIFIED_PARTNER",
];

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  vote: z.enum(["verify", "dispute"]),
  note: z.string().trim().max(500).optional(),
  userName: z.string().trim().min(1).max(120).optional(),
  contributor: z
    .object({
      label: z.string().trim().max(120).optional(),
      role: z.enum(contributorRoleValues).optional(),
      tier: z.enum(memberTierValues).optional(),
      isAnonymous: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";

  const result = await verifyClaimAction({
    claimId: id,
    userId,
    userName: parsed.data.userName,
    vote: parsed.data.vote,
    note: parsed.data.note,
    contributor: parsed.data.contributor,
  });

  if ("error" in result) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
