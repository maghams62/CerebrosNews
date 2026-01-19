export type StoryGroupPerspective = {
  id: string;
  source: string;
  sourceType: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  summary?: string;
  bias?: string;
  publishedAt?: string;
  imageUrl?: string | null;
  author?: string | null;
};

export type StoryGroupAnalysis = {
  summary_markdown: string;
  bias: string;
  missing: string;
  impact: string;
  framing?: string;
  sentiment?: string;
  agreement?: string;
  confidence?: string;
  framingSpectrum?: string;
  coverageMix?: string;
  selectionSignals?: string;
  citations: string[];
};

export type StoryGroup = {
  id: string;
  canonicalTitle: string;
  canonicalUrl?: string;
  topicTags: string[];
  createdAt: string;
  updatedAt?: string;
  perspectives: StoryGroupPerspective[];
  analysis: StoryGroupAnalysis;
  imageUrl?: string | null;
};
