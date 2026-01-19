import { NextResponse } from "next/server";
import { fetchBlueskyItems } from "@/lib/connectors/bluesky/fetch";

export const runtime = "nodejs";

function normalizeTopics(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topics = normalizeTopics(body?.topics);
  const limit = typeof body?.limit === "number" ? body.limit : undefined;
  const includeTimeline = typeof body?.includeTimeline === "boolean" ? body.includeTimeline : undefined;
  const payload = await fetchBlueskyItems({ topics, limit, includeTimeline });
  return NextResponse.json({ items: payload.items, counts: payload.counts, fetchedAtMs: payload.fetchedAtMs });
}

export async function GET() {
  const payload = await fetchBlueskyItems({ topics: [] });
  return NextResponse.json({ items: payload.items, counts: payload.counts, fetchedAtMs: payload.fetchedAtMs });
}
