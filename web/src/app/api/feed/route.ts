import { NextResponse } from "next/server";
import { getFeed } from "@/lib/feed/getFeed";

export const runtime = "nodejs";

export async function GET() {
  const items = await getFeed();
  return NextResponse.json(items);
}

