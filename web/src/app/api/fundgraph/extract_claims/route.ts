import { NextResponse } from "next/server";
import { z } from "zod";
import { extractClaimsFromNewsSource } from "@/lib/fundgraph/actions/extractClaims";
import { createId } from "@/lib/fundgraph/ids";
import { getNewsSourceById, getNewsSourceByUrl } from "@/lib/fundgraph/newsSource";
import { NewsSource } from "@/lib/fundgraph/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  newsId: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  title: z.string().trim().min(3).max(300).optional(),
  content: z.string().trim().min(20).max(40_000).optional(),
  summary: z.string().trim().min(8).max(5_000).optional(),
  sourceName: z.string().trim().min(1).max(120).optional(),
  publishedAt: z.string().datetime().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  force: z.boolean().optional(),
});

async function resolveSource(input: z.infer<typeof requestSchema>): Promise<NewsSource | null> {
  if (input.newsId) {
    const byId = await getNewsSourceById(input.newsId);
    if (byId) return byId;
  }

  if (input.url) {
    const byUrl = await getNewsSourceByUrl(input.url);
    if (byUrl) return byUrl;
  }

  if (input.title && (input.content || input.summary) && input.url) {
    const content = input.content?.trim() || input.summary?.trim() || "";
    return {
      id: input.newsId || createId("fg-news"),
      title: input.title,
      url: input.url,
      sourceName: input.sourceName ?? "Cerebros News",
      summary: input.summary ?? content.slice(0, 800),
      content,
      publishedAt: input.publishedAt ?? new Date().toISOString(),
      tags: input.tags ?? [],
    };
  }

  return null;
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const source = await resolveSource(parsed.data);
  if (!source) {
    return NextResponse.json(
      {
        error: "news_source_not_found",
        detail: "Provide newsId, or url/title/content to extract claims.",
      },
      { status: 404 }
    );
  }

  const result = await extractClaimsFromNewsSource(source, Boolean(parsed.data.force));
  return NextResponse.json(result);
}
