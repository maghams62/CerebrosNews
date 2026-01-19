import { SourceType } from "@/types/feed";

export interface FeedSource {
  key: string;
  feedUrl: string;
  sourceName: string;
  sourceType: SourceType;
}

export const FEED_SOURCES: FeedSource[] = [
  {
    key: "techcrunch",
    feedUrl: "https://techcrunch.com/feed/",
    sourceName: "TechCrunch",
    sourceType: "editorial",
  },
  {
    key: "theverge",
    feedUrl: "https://www.theverge.com/rss/index.xml",
    sourceName: "The Verge",
    sourceType: "editorial",
  },
  {
    key: "wired",
    feedUrl: "https://www.wired.com/feed/rss",
    sourceName: "Wired",
    sourceType: "editorial",
  },
  {
    key: "arstechnica",
    feedUrl: "https://feeds.arstechnica.com/arstechnica/index/",
    sourceName: "Ars Technica",
    sourceType: "editorial",
  },
  {
    key: "venturebeat",
    feedUrl: "https://venturebeat.com/feed/",
    sourceName: "VentureBeat",
    sourceType: "editorial",
  },
  {
    key: "engadget",
    feedUrl: "https://www.engadget.com/rss.xml",
    sourceName: "Engadget",
    sourceType: "editorial",
  },
  {
    key: "theguardian",
    feedUrl: "https://www.theguardian.com/uk/technology/rss",
    sourceName: "The Guardian",
    sourceType: "editorial",
  },
  {
    key: "reuters",
    feedUrl: "https://feeds.reuters.com/reuters/technologyNews",
    sourceName: "Reuters",
    sourceType: "editorial",
  },
  {
    key: "wsj",
    feedUrl: "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    sourceName: "The Wall Street Journal",
    sourceType: "editorial",
  },
  {
    key: "bloomberg",
    feedUrl: "https://www.bloomberg.com/feeds/technology/rss",
    sourceName: "Bloomberg",
    sourceType: "editorial",
  },
  {
    key: "apnews",
    feedUrl: "https://apnews.com/apf-topnews?output=rss",
    sourceName: "AP News",
    sourceType: "editorial",
  },
  {
    key: "theregister",
    feedUrl: "https://www.theregister.com/headlines.atom",
    sourceName: "The Register",
    sourceType: "editorial",
  },
  {
    key: "zdnet",
    feedUrl: "https://www.zdnet.com/news/rss.xml",
    sourceName: "ZDNet",
    sourceType: "editorial",
  },
  {
    key: "mittechreview",
    feedUrl: "https://www.technologyreview.com/feed/",
    sourceName: "MIT Technology Review",
    sourceType: "editorial",
  },
  {
    key: "ieeespectrum",
    feedUrl: "https://spectrum.ieee.org/rss/fulltext",
    sourceName: "IEEE Spectrum",
    sourceType: "editorial",
  },
  {
    key: "slashdot",
    feedUrl: "http://rss.slashdot.org/Slashdot/slashdotMain",
    sourceName: "Slashdot",
    sourceType: "community",
  },
  {
    key: "thehackernews",
    feedUrl: "https://thehackernews.com/feeds/posts/default?alt=rss",
    sourceName: "The Hacker News",
    sourceType: "editorial",
  },
  {
    key: "bleepingcomputer",
    feedUrl: "https://www.bleepingcomputer.com/feed/",
    sourceName: "BleepingComputer",
    sourceType: "editorial",
  },
  {
    key: "krebsonsecurity",
    feedUrl: "https://krebsonsecurity.com/feed/",
    sourceName: "KrebsOnSecurity",
    sourceType: "editorial",
  },
  {
    key: "infoq",
    feedUrl: "https://feed.infoq.com/",
    sourceName: "InfoQ",
    sourceType: "editorial",
  },
  {
    key: "githubblog",
    feedUrl: "https://github.blog/feed/",
    sourceName: "GitHub Blog",
    sourceType: "editorial",
  },
  {
    key: "openai",
    feedUrl: "https://openai.com/blog/rss.xml",
    sourceName: "OpenAI",
    sourceType: "editorial",
  },
  {
    key: "google",
    feedUrl: "https://blog.google/rss",
    sourceName: "Google Blog",
    sourceType: "editorial",
  },
  {
    key: "apple",
    feedUrl: "https://www.apple.com/newsroom/rss-feed.rss",
    sourceName: "Apple Newsroom",
    sourceType: "editorial",
  },
  {
    key: "microsoft",
    feedUrl: "https://blogs.microsoft.com/feed/",
    sourceName: "Microsoft Blog",
    sourceType: "editorial",
  },
  {
    key: "meta",
    feedUrl: "https://about.fb.com/news/feed/",
    sourceName: "Meta Newsroom",
    sourceType: "editorial",
  },
  {
    key: "nvidia",
    feedUrl: "https://blogs.nvidia.com/feed/",
    sourceName: "NVIDIA Blog",
    sourceType: "editorial",
  },
  {
    key: "anthropic",
    feedUrl: "https://www.anthropic.com/news/rss.xml",
    sourceName: "Anthropic",
    sourceType: "editorial",
  },
  {
    key: "smashingmagazine",
    feedUrl: "https://www.smashingmagazine.com/feed/",
    sourceName: "Smashing Magazine",
    sourceType: "editorial",
  },
  {
    key: "awsblog",
    feedUrl: "https://aws.amazon.com/blogs/aws/feed/",
    sourceName: "AWS News Blog",
    sourceType: "editorial",
  },
  {
    key: "googlecloudblog",
    feedUrl: "https://cloud.google.com/blog/rss/",
    sourceName: "Google Cloud Blog",
    sourceType: "editorial",
  },
  {
    key: "azureblog",
    feedUrl: "https://azure.microsoft.com/en-us/updates/feed/",
    sourceName: "Azure Updates",
    sourceType: "editorial",
  },
  {
    key: "hackernews",
    feedUrl: "https://news.ycombinator.com/rss",
    sourceName: "Hacker News",
    sourceType: "community",
  },
  {
    key: "lobsters",
    feedUrl: "https://lobste.rs/rss",
    sourceName: "Lobsters",
    sourceType: "community",
  },
  {
    key: "reddit_technology",
    feedUrl: "https://www.reddit.com/r/technology/.rss",
    sourceName: "Reddit r/technology",
    sourceType: "community",
  },
  {
    key: "reddit_programming",
    feedUrl: "https://www.reddit.com/r/programming/.rss",
    sourceName: "Reddit r/programming",
    sourceType: "community",
  },
  {
    key: "reddit_machinelearning",
    feedUrl: "https://www.reddit.com/r/MachineLearning/.rss",
    sourceName: "Reddit r/MachineLearning",
    sourceType: "community",
  },
];

