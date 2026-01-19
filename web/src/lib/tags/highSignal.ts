const HIGH_SIGNAL_TAGS = [
  "AI",
  "Startups",
  "Product",
  "Design",
  "Security",
  "Data",
  "Policy",
  "Climate",
  "Health",
  "Finance",
  "Crypto",
  "Robotics",
  "Hardware",
  "Space",
  "Media",
  "Education",
  "Cloud",
  "Mobile",
] as const;

const CANONICAL_TAGS: Record<string, string> = {
  "ai": "AI",
  "artificial intelligence": "AI",
  "machine learning": "AI",
  "ml": "AI",
  "llm": "AI",
  "llms": "AI",
  "genai": "AI",
  "generative ai": "AI",
  "openai": "AI",
  "chatgpt": "AI",
  "gpt": "AI",
  "gpt-4": "AI",
  "gpt-5": "AI",
  "startup": "Startups",
  "startups": "Startups",
  "founders": "Startups",
  "entrepreneurship": "Startups",
  "venture capital": "Startups",
  "vc": "Startups",
  "product": "Product",
  "product management": "Product",
  "design": "Design",
  "ux": "Design",
  "ui": "Design",
  "security": "Security",
  "cybersecurity": "Security",
  "privacy": "Security",
  "data": "Data",
  "data science": "Data",
  "analytics": "Data",
  "policy": "Policy",
  "regulation": "Policy",
  "government": "Policy",
  "geopolitics": "Policy",
  "climate": "Climate",
  "energy": "Climate",
  "sustainability": "Climate",
  "health": "Health",
  "biotech": "Health",
  "medicine": "Health",
  "finance": "Finance",
  "fintech": "Finance",
  "markets": "Finance",
  "economy": "Finance",
  "crypto": "Crypto",
  "blockchain": "Crypto",
  "web3": "Crypto",
  "robotics": "Robotics",
  "automation": "Robotics",
  "hardware": "Hardware",
  "semiconductors": "Hardware",
  "chips": "Hardware",
  "space": "Space",
  "media": "Media",
  "journalism": "Media",
  "misinformation": "Media",
  "education": "Education",
  "edtech": "Education",
  "cloud": "Cloud",
  "aws": "Cloud",
  "amazon web services": "Cloud",
  "azure": "Cloud",
  "gcp": "Cloud",
  "google cloud": "Cloud",
  "kubernetes": "Cloud",
  "devops": "Cloud",
  "infrastructure": "Cloud",
  "ios": "Mobile",
  "android": "Mobile",
  "mobile": "Mobile",
  "app store": "Mobile",
  "play store": "Mobile",
};

const HIGH_SIGNAL_LOOKUP = new Map<string, string>(
  HIGH_SIGNAL_TAGS.map((tag) => [normalizeKey(tag), tag])
);

function normalizeKey(tag: string) {
  return tag
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeTag(tag: string) {
  const normalized = normalizeKey(tag);
  return CANONICAL_TAGS[normalized] ?? HIGH_SIGNAL_LOOKUP.get(normalized) ?? null;
}

export function filterHighSignalTags(tags: string[], { max = 6 }: { max?: number } = {}) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const canonical = canonicalizeTag(tag);
    if (!canonical || seen.has(canonical)) continue;
    out.push(canonical);
    seen.add(canonical);
    if (out.length >= max) break;
  }
  return out;
}

export { HIGH_SIGNAL_TAGS };
