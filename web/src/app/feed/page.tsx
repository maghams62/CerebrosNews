import { FeedClient } from "@/components/FeedClient";
import { getFeed } from "@/lib/feed/getFeed";
import { readOfflineDataset } from "@/lib/dataset/offlineDataset";
import { offlineDatasetToFeedItems } from "@/lib/dataset/toFeedItems";
import { readOfflineStoryGroups } from "@/lib/dataset/offlineStoryGroups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FeedPage() {
  const storyGroups = await readOfflineStoryGroups();
  const offline = await readOfflineDataset();
  const feed = offline ? offlineDatasetToFeedItems(offline) : await getFeed();

  return (
    <main>
      <FeedClient initialFeedItems={feed ?? undefined} initialStoryGroups={storyGroups ?? undefined} />
    </main>
  );
}

