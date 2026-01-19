import { InsightBundle } from "@/types/insights";
import { Story } from "@/types/story";

export interface StoryWithInsights {
  story: Story;
  insights: InsightBundle;
}

