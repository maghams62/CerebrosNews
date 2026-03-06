import { NextResponse } from "next/server";
import { z } from "zod";
import { getGamificationUser, spendCredits } from "@/lib/fundgraph/gamification";
import { createId } from "@/lib/fundgraph/ids";
import { generateWatchlistBrief } from "@/lib/fundgraph/memo";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { addMemo } from "@/lib/fundgraph/store.contract";
import { Memo } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  fundIds: z.array(z.string().trim().min(1)).min(2).max(12),
  memoType: z.enum(["quick_brief", "investment_memo", "deep_diligence"]).optional(),
  includeSignals: z.boolean().optional(),
  includeClaims: z.boolean().optional(),
  includePortfolio: z.boolean().optional(),
  includeGraphContext: z.boolean().optional(),
  includeCommunityDiscussion: z.boolean().optional(),
  timeWindow: z.enum(["30d", "90d", "all_time"]).optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const user = await getGamificationUser(userId);
  const tierAllowsMemo = user.tier === "analyst" || user.tier === "insider";
  if (!tierAllowsMemo && user.credits < 2) {
    return NextResponse.json(
      {
        error: "memo_locked",
        detail: "Generate watchlist brief requires Analyst tier or 2 credits.",
        gamification: user,
      },
      { status: 403 }
    );
  }

  try {
    const generated = await generateWatchlistBrief({
      userId,
      fundIds: parsed.data.fundIds,
      memoType: parsed.data.memoType,
      includeSignals: parsed.data.includeSignals,
      includeClaims: parsed.data.includeClaims,
      includePortfolio: parsed.data.includePortfolio,
      includeGraphContext: parsed.data.includeGraphContext,
      includeCommunityDiscussion: parsed.data.includeCommunityDiscussion,
      timeWindow: parsed.data.timeWindow,
    });

    const memo: Memo = {
      id: createId("fg-memo"),
      userId,
      artifactType: "watchlist_brief",
      memoType: generated.options.memoType,
      generationMode: generated.generationMode,
      primaryFundId: generated.primaryFundId,
      options: generated.options,
      fundIds: generated.fundIds,
      memoMarkdown: generated.memoMarkdown,
      sections: generated.sections,
      citations: generated.citations,
      isEdited: false,
      createdAt: new Date().toISOString(),
    };

    await addMemo(memo);
    const updatedUser = tierAllowsMemo ? user : await spendCredits(userId, 2, "memo_generate", memo.id);

    return NextResponse.json({
      mode: getFundgraphDataMode(),
      memoId: memo.id,
      memoMarkdown: memo.memoMarkdown,
      artifactType: memo.artifactType,
      memoType: memo.memoType,
      generationMode: memo.generationMode,
      primaryFundId: memo.primaryFundId,
      options: memo.options,
      fundIds: memo.fundIds,
      createdAt: memo.createdAt,
      editorHtml: memo.editorHtml,
      isEdited: memo.isEdited,
      lastEditedAt: memo.lastEditedAt,
      sections: memo.sections,
      citations: memo.citations,
      gamification: updatedUser,
      realModePlaceholder: getFundgraphDataMode() === "real",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "memo_generation_failed";
    if (message === "fund_not_found") {
      return NextResponse.json({ error: "fund_not_found" }, { status: 404 });
    }
    if (message === "watchlist_requires_multiple_funds") {
      return NextResponse.json({ error: "watchlist_requires_multiple_funds" }, { status: 400 });
    }
    return NextResponse.json({ error: "memo_generation_failed", detail: message }, { status: 500 });
  }
}
