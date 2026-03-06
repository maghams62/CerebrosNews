import { NextResponse } from "next/server";
import { getFeed } from "@/lib/feed/getFeed";
import { readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { offlineDatasetToFeedItems } from "@/lib/dataset/toFeedItems";

export const runtime = "nodejs";

export async function GET() {
  const offline = await readOfflineDataset();
  const items = offline ? offlineDatasetToFeedItems(offline) : await getFeed();
  return NextResponse.json(items);
}
