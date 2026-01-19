import { DatasetSource, SourceType } from "./schema";
import { EXTRA_SOURCES } from "./feedCatalog";

export interface SourceFeed {
  sourceId: string;
  url: string;
  kind: "rss" | "googlenews_rss" | "hn_algolia";
}

export const SOURCES: DatasetSource[] = [
  {
    id: "techcrunch",
    name: "TechCrunch",
    homepage: "https://techcrunch.com",
    type: "editorial",
    rss: "https://techcrunch.com/feed/",
    bias: null,
  },
  {
    id: "theverge",
    name: "The Verge",
    homepage: "https://www.theverge.com",
    type: "editorial",
    rss: "https://www.theverge.com/rss/index.xml",
    bias: null,
  },
  {
    id: "wired",
    name: "WIRED",
    homepage: "https://www.wired.com",
    type: "editorial",
    rss: "https://www.wired.com/feed/rss",
    bias: null,
  },
  {
    id: "platformer",
    name: "Platformer",
    homepage: "https://www.platformer.news",
    type: "editorial",
    rss: "https://www.platformer.news/feed",
    bias: null,
  },
  {
    id: "noahpinion",
    name: "Noahpinion",
    homepage: "https://www.noahpinion.blog",
    type: "editorial",
    rss: "https://www.noahpinion.blog/feed",
    bias: null,
  },
  {
    id: "arstechnica",
    name: "Ars Technica",
    homepage: "https://arstechnica.com",
    type: "editorial",
    rss: "https://feeds.arstechnica.com/arstechnica/index/",
    bias: null,
  },
  {
    id: "venturebeat",
    name: "VentureBeat",
    homepage: "https://venturebeat.com",
    type: "editorial",
    rss: "https://venturebeat.com/feed/",
    bias: null,
  },
  {
    id: "engadget",
    name: "Engadget",
    homepage: "https://www.engadget.com",
    type: "editorial",
    rss: "https://www.engadget.com/rss.xml",
    bias: null,
  },
  {
    id: "theguardian",
    name: "The Guardian",
    homepage: "https://www.theguardian.com/uk/technology",
    type: "editorial",
    rss: "https://www.theguardian.com/uk/technology/rss",
    bias: null,
  },
  {
    id: "reuters",
    name: "Reuters",
    homepage: "https://www.reuters.com/technology/",
    type: "editorial",
    rss: "https://feeds.reuters.com/reuters/technologyNews",
    bias: null,
  },
  {
    id: "wsj",
    name: "The Wall Street Journal",
    homepage: "https://www.wsj.com/news/technology",
    type: "editorial",
    rss: "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    bias: null,
  },
  {
    id: "bloomberg",
    name: "Bloomberg",
    homepage: "https://www.bloomberg.com/technology",
    type: "editorial",
    rss: "https://www.bloomberg.com/feeds/technology/rss",
    bias: null,
  },
  {
    id: "apnews",
    name: "AP News",
    homepage: "https://apnews.com/hub/technology",
    type: "editorial",
    rss: "https://apnews.com/apf-topnews?output=rss",
    bias: null,
  },
  {
    id: "theregister",
    name: "The Register",
    homepage: "https://www.theregister.com",
    type: "editorial",
    rss: "https://www.theregister.com/headlines.atom",
    bias: null,
  },
  {
    id: "zdnet",
    name: "ZDNet",
    homepage: "https://www.zdnet.com",
    type: "editorial",
    rss: "https://www.zdnet.com/news/rss.xml",
    bias: null,
  },
  {
    id: "mittechreview",
    name: "MIT Technology Review",
    homepage: "https://www.technologyreview.com",
    type: "editorial",
    rss: "https://www.technologyreview.com/feed/",
    bias: null,
  },
  {
    id: "ieeespectrum",
    name: "IEEE Spectrum",
    homepage: "https://spectrum.ieee.org",
    type: "editorial",
    rss: "https://spectrum.ieee.org/rss/fulltext",
    bias: null,
  },
  {
    id: "slashdot",
    name: "Slashdot",
    homepage: "https://slashdot.org",
    type: "community",
    rss: "http://rss.slashdot.org/Slashdot/slashdotMain",
    bias: null,
  },
  {
    id: "thehackernews",
    name: "The Hacker News",
    homepage: "https://thehackernews.com",
    type: "editorial",
    rss: "https://thehackernews.com/feeds/posts/default?alt=rss",
    bias: null,
  },
  {
    id: "bleepingcomputer",
    name: "BleepingComputer",
    homepage: "https://www.bleepingcomputer.com",
    type: "editorial",
    rss: "https://www.bleepingcomputer.com/feed/",
    bias: null,
  },
  {
    id: "krebsonsecurity",
    name: "KrebsOnSecurity",
    homepage: "https://krebsonsecurity.com",
    type: "editorial",
    rss: "https://krebsonsecurity.com/feed/",
    bias: null,
  },
  {
    id: "infoq",
    name: "InfoQ",
    homepage: "https://www.infoq.com",
    type: "editorial",
    rss: "https://feed.infoq.com/",
    bias: null,
  },
  {
    id: "githubblog",
    name: "GitHub Blog",
    homepage: "https://github.blog",
    type: "primary",
    rss: "https://github.blog/feed/",
    bias: null,
  },
  {
    id: "openai",
    name: "OpenAI",
    homepage: "https://openai.com/blog",
    type: "primary",
    rss: "https://openai.com/blog/rss.xml",
    bias: null,
  },
  {
    id: "google",
    name: "Google Blog",
    homepage: "https://blog.google",
    type: "primary",
    rss: "https://blog.google/rss",
    bias: null,
  },
  {
    id: "apple",
    name: "Apple Newsroom",
    homepage: "https://www.apple.com/newsroom/",
    type: "primary",
    rss: "https://www.apple.com/newsroom/rss-feed.rss",
    bias: null,
  },
  {
    id: "microsoft",
    name: "Microsoft Blog",
    homepage: "https://blogs.microsoft.com/blog/",
    type: "primary",
    rss: "https://blogs.microsoft.com/feed/",
    bias: null,
  },
  {
    id: "meta",
    name: "Meta Newsroom",
    homepage: "https://about.fb.com/news/",
    type: "primary",
    rss: "https://about.fb.com/news/feed/",
    bias: null,
  },
  {
    id: "nvidia",
    name: "NVIDIA Blog",
    homepage: "https://blogs.nvidia.com",
    type: "primary",
    rss: "https://blogs.nvidia.com/feed/",
    bias: null,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    homepage: "https://www.anthropic.com/news",
    type: "primary",
    rss: "https://www.anthropic.com/news/rss.xml",
    bias: null,
  },
  {
    id: "smashingmagazine",
    name: "Smashing Magazine",
    homepage: "https://www.smashingmagazine.com",
    type: "editorial",
    rss: "https://www.smashingmagazine.com/feed/",
    bias: null,
  },
  {
    id: "awsblog",
    name: "AWS News Blog",
    homepage: "https://aws.amazon.com/blogs/aws/",
    type: "primary",
    rss: "https://aws.amazon.com/blogs/aws/feed/",
    bias: null,
  },
  {
    id: "googlecloudblog",
    name: "Google Cloud Blog",
    homepage: "https://cloud.google.com/blog",
    type: "primary",
    rss: "https://cloud.google.com/blog/rss/",
    bias: null,
  },
  {
    id: "azureblog",
    name: "Azure Updates",
    homepage: "https://azure.microsoft.com/en-us/updates/",
    type: "primary",
    rss: "https://azure.microsoft.com/en-us/updates/feed/",
    bias: null,
  },
  {
    id: "hackernews",
    name: "Hacker News",
    homepage: "https://news.ycombinator.com",
    type: "community",
    rss: "https://news.ycombinator.com/rss",
    logoUrl: "https://news.ycombinator.com/favicon.ico",
    bias: null,
  },
  {
    id: "lobsters",
    name: "Lobsters",
    homepage: "https://lobste.rs",
    type: "community",
    rss: "https://lobste.rs/rss",
    logoUrl: "https://lobste.rs/favicon.ico",
    bias: null,
  },
  {
    id: "reddit_technology",
    name: "Reddit r/technology",
    homepage: "https://www.reddit.com/r/technology/",
    type: "community",
    rss: "https://www.reddit.com/r/technology/.rss",
    logoUrl: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png",
    bias: null,
  },
  {
    id: "reddit_programming",
    name: "Reddit r/programming",
    homepage: "https://www.reddit.com/r/programming/",
    type: "community",
    rss: "https://www.reddit.com/r/programming/.rss",
    logoUrl: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png",
    bias: null,
  },
  {
    id: "reddit_machinelearning",
    name: "Reddit r/MachineLearning",
    homepage: "https://www.reddit.com/r/MachineLearning/",
    type: "community",
    rss: "https://www.reddit.com/r/MachineLearning/.rss",
    logoUrl: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png",
    bias: null,
  },
  ...EXTRA_SOURCES,
  // Google News query sources (configurable)
  {
    id: "googlenews",
    name: "Google News",
    homepage: "https://news.google.com",
    type: "aggregator",
    rss: null,
    bias: null,
  },
];

export const GOOGLE_NEWS_QUERIES: { id: string; label: string; query: string }[] = [
  { id: "ai_bubble", label: "AI bubble", query: "AI bubble" },
  { id: "ai_not_bubble", label: "AI is not a bubble", query: "AI is not a bubble" },
  { id: "open_source_ai", label: "open source AI", query: "open source AI" },
  { id: "closed_source_ai", label: "closed source AI", query: "closed source AI" },
  { id: "ai_regulation", label: "AI regulation", query: "AI regulation" },
  { id: "gpu_shortages", label: "GPU shortages", query: "GPU shortages" },
  { id: "semiconductor", label: "semiconductor", query: "semiconductor" },
  { id: "robotics_startup", label: "robotics startup", query: "robotics startup" },
  { id: "cybersecurity_breach", label: "cybersecurity breach", query: "cybersecurity breach" },
  { id: "react_nextjs", label: "React Next.js", query: "React Next.js" },
  { id: "kubernetes_postgres", label: "Kubernetes Postgres", query: "Kubernetes Postgres" },
  { id: "devtools_launch", label: "developer tools launch", query: "developer tools launch" },
  { id: "ransomware", label: "ransomware", query: "ransomware" },
  { id: "zero_day", label: "zero-day", query: "zero-day" },
  { id: "data_privacy", label: "data privacy", query: "data privacy" },
  { id: "cloud_outage", label: "cloud outage", query: "cloud outage" },
  { id: "reuters_tech", label: "Reuters tech", query: "site:reuters.com technology" },
  { id: "guardian_tech", label: "Guardian tech", query: "site:theguardian.com technology" },
  { id: "wsj_tech", label: "WSJ tech", query: "site:wsj.com technology" },
  { id: "bloomberg_tech", label: "Bloomberg tech", query: "site:bloomberg.com technology" },
  { id: "ap_tech", label: "AP tech", query: "site:apnews.com technology" },
  { id: "openai_blog", label: "OpenAI blog", query: "site:openai.com blog" },
  { id: "anthropic_news", label: "Anthropic news", query: "site:anthropic.com news" },
];

export function googleNewsRssUrl(query: string): string {
  // Basic Google News RSS search endpoint.
  // Example format: https://news.google.com/rss/search?q=AI%20bubble&hl=en-US&gl=US&ceid=US:en
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

export function getSourceType(sourceId: string): SourceType {
  const s = SOURCES.find((x) => x.id === sourceId);
  return s?.type ?? "primary";
}

export function feedsToFetch(): SourceFeed[] {
  const feeds: SourceFeed[] = [];
  for (const s of SOURCES) {
    if (s.rss) feeds.push({ sourceId: s.id, url: s.rss, kind: "rss" });
  }
  feeds.push({ sourceId: "hackernews", url: "https://hn.algolia.com/api/v1/search_by_date?tags=story", kind: "hn_algolia" });
  for (const q of GOOGLE_NEWS_QUERIES) {
    feeds.push({ sourceId: "googlenews", url: googleNewsRssUrl(q.query), kind: "googlenews_rss" });
  }
  return feeds;
}

