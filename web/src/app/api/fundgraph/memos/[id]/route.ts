import { NextResponse } from "next/server";
import { z } from "zod";
import { getFundgraphDataMode } from "@/lib/fundgraph/mode";
import { getMemoById, updateMemoById } from "@/lib/fundgraph/store.contract";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    memoMarkdown: z.string().max(200_000).optional(),
    editorHtml: z.string().max(250_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.memoMarkdown && !value.editorHtml) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "memoMarkdown or editorHtml is required",
        path: ["memoMarkdown"],
      });
    }
  });

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const memo = await getMemoById(id);
  if (!memo) {
    return NextResponse.json({ error: "memo_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    memo,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const existing = await getMemoById(id);
  if (!existing) {
    return NextResponse.json({ error: "memo_not_found" }, { status: 404 });
  }

  const userId = parsed.data.userId?.trim() || req.headers.get("x-fundgraph-user-id")?.trim() || "demo";
  if (existing.userId && existing.userId !== userId) {
    return NextResponse.json({ error: "memo_forbidden" }, { status: 403 });
  }

  const updated = await updateMemoById(id, {
    memoMarkdown: parsed.data.memoMarkdown ?? existing.memoMarkdown,
    editorHtml: parsed.data.editorHtml ?? existing.editorHtml,
    isEdited: true,
    lastEditedAt: new Date().toISOString(),
  });

  if (!updated) {
    return NextResponse.json({ error: "memo_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    mode: getFundgraphDataMode(),
    memo: updated,
    realModePlaceholder: getFundgraphDataMode() === "real",
  });
}
