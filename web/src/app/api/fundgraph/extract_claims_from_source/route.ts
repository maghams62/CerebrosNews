import { NextResponse } from "next/server";
import { z } from "zod";
import { extractClaimsFromStoredSource } from "@/lib/fundgraph/actions/extractClaims";

export const runtime = "nodejs";

const requestSchema = z.object({
  sourceId: z.string().trim().min(1),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const result = await extractClaimsFromStoredSource(parsed.data.sourceId, Boolean(parsed.data.force));
  if ("error" in result && result.error === "source_not_found") {
    return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  }
  if ("error" in result && result.error === "insufficient_source_text") {
    return NextResponse.json(
      {
        error: result.error,
        detail: result.detail,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}
