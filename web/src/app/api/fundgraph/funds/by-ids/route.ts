import { NextResponse } from "next/server";
import { sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { readFunds } from "@/lib/fundgraph/storage";

export const runtime = "nodejs";

const MAX_IDS = 150;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_IDS);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = parseIds(url.searchParams.get("ids"));
  if (!ids.length) {
    return NextResponse.json({ count: 0, funds: [] });
  }

  const funds = await readFunds();
  const byId = new Map(funds.map((fund) => [fund.id, fund]));
  const bySlug = new Map(funds.map((fund) => [fund.slug, fund]));

  const selected = ids
    .map((id) => byId.get(id) ?? bySlug.get(id))
    .filter((fund): fund is NonNullable<typeof fund> => Boolean(fund));

  return NextResponse.json({
    count: selected.length,
    funds: selected.map(sanitizeFundForDisplay),
  });
}
