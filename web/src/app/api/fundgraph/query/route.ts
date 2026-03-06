import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretGraphQueryWithLlm } from "@/lib/fundgraph/llm";

export const runtime = "nodejs";

const querySchema = z.object({
  query: z.string().trim().min(1).max(700),
  presetId: z.string().trim().max(80).optional(),
  nodeLabels: z.array(z.string().trim().min(1).max(120)).max(320).optional(),
  exampleQueries: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
});

export async function POST(req: Request) {
  const parsed = querySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const query = parsed.data.query.trim();
  const nodeLabels = parsed.data.nodeLabels ?? [];
  const exampleQueries = parsed.data.exampleQueries ?? [];

  if (!process.env.OPENAI_API_KEY || !nodeLabels.length) {
    return NextResponse.json({
      mode: "fallback",
      canonicalQuery: query,
      intent: "search",
      confidence: 0,
      rationale: "LLM unavailable or graph labels missing.",
    });
  }

  try {
    const interpreted = await interpretGraphQueryWithLlm({
      query,
      presetId: parsed.data.presetId,
      entityLabels: nodeLabels,
      exampleQueries,
    });
    return NextResponse.json({
      mode: "llm",
      canonicalQuery: interpreted.canonicalQuery.trim() || query,
      intent: interpreted.intent,
      confidence: interpreted.confidence ?? 0,
      rationale: interpreted.rationale ?? "",
    });
  } catch {
    return NextResponse.json({
      mode: "fallback",
      canonicalQuery: query,
      intent: "search",
      confidence: 0,
      rationale: "LLM interpretation failed, used deterministic query parser.",
    });
  }
}
