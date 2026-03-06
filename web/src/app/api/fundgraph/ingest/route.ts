import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContribution } from "@/lib/fundgraph/gamification";
import { materializeSource } from "@/lib/fundgraph/ingestion";
import { addSource } from "@/lib/fundgraph/store.contract";
import { SourceType } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const sourceTypeValues: [SourceType, ...SourceType[]] = [
  "NEWS_ARTICLE",
  "PASTED_TEXT",
  "URL",
  "TWEET_THREAD_TEXT",
  "PDF_TEXT",
  "CSV_FUNDS",
];

const requestSchema = z.object({
  type: z.enum(sourceTypeValues),
  title: z.string().trim().min(1).max(300).optional(),
  url: z.string().url().optional(),
  text: z.string().max(160_000).optional(),
  file: z.string().max(160_000).optional(),
  newsId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        detail: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const source = await materializeSource(parsed.data);
  if (source.type !== "URL" && source.rawText.trim().length < 20) {
    return NextResponse.json(
      {
        error: "insufficient_text",
        detail: "Provide at least 20 characters of source text for ingestion.",
      },
      { status: 400 }
    );
  }

  await addSource(source);
  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  const gamification = await applyContribution(userId, "add_source", source.id);

  return NextResponse.json({
    sourceId: source.id,
    source,
    gamification,
  });
}
