import type { StoryPerspective } from "@/types/storyPerspective";
import type { FeedItemMetrics, SourceType } from "@/types/feed";

export interface Story {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string;
  sourceName: string;
  sourceType: SourceType;
  postUrl?: string;
  author?: string;
  authorHandle?: string;
  tags?: string[];
  metrics?: FeedItemMetrics;
  sources?: string[];
  publishedAt: string;
  fullText: string;
  perspectives: StoryPerspective[];
  analysis?: {
    summary_markdown: string;
    bias: string;
    missing: string;
    impact: string;
    citations?: string[];
  };
}
