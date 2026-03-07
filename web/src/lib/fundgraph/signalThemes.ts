import { NewsClaim, Signal } from "@/fundgraph/types";

export interface CuratedSignalTheme {
  slug: string;
  title: string;
  keywords: string[];
  tagAliases?: string[];
}

const DEFAULT_THEME_SLUG = "market-breadth";
const ALL_THEME_SLUG = "all";

export const CURATED_SIGNAL_THEMES: CuratedSignalTheme[] = [
  {
    slug: "market-breadth",
    title: "Market breadth",
    keywords: ["market breadth", "breadth", "participation", "sector rotation", "advance", "decline", "risk-on", "risk-off"],
    tagAliases: ["breadth", "markets", "market"],
  },
  {
    slug: "capital-flows",
    title: "Capital flows",
    keywords: ["capital", "funding", "fundraise", "raises", "round", "valuation", "led", "inflow", "outflow", "allocation", "ipo", "m&a"],
    tagAliases: ["funding round", "fundraise", "startup finance", "finance", "ipo", "m&a", "ai funding"],
  },
  {
    slug: "ai-infrastructure",
    title: "AI infrastructure",
    keywords: ["infrastructure", "gpu", "compute", "inference", "chip", "data center", "infra"],
    tagAliases: ["ai infra", "infrastructure"],
  },
  {
    slug: "developer-tooling",
    title: "Developer tooling",
    keywords: ["developer", "api", "sdk", "devtools", "tooling", "platform", "integration"],
    tagAliases: ["devtools", "developer tools", "frontend"],
  },
  {
    slug: "security-governance",
    title: "Security & governance",
    keywords: ["security", "compliance", "governance", "policy", "identity", "regulation", "risk"],
    tagAliases: ["policy", "security", "governance", "compliance"],
  },
  {
    slug: "model-eval-infra",
    title: "Model eval infra",
    keywords: ["eval", "evaluation", "benchmark", "testing", "safety", "monitoring"],
    tagAliases: ["eval", "evaluation", "benchmark", "testing"],
  },
  {
    slug: "founder-network",
    title: "Founder network",
    keywords: ["founder", "founded", "alumni", "hiring", "joins", "team", "talent"],
    tagAliases: ["founder", "talent", "hiring"],
  },
];

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTag(input: string): string {
  return input.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function themeForText(text: string, normalizedTags: string[] = []): string {
  let bestSlug = DEFAULT_THEME_SLUG;
  let bestScore = 0;

  for (const theme of CURATED_SIGNAL_THEMES) {
    let score = 0;
    for (const keyword of theme.keywords) {
      if (text.includes(keyword)) score += 1;
    }
    for (const alias of theme.tagAliases ?? []) {
      if (normalizedTags.includes(alias.toLowerCase())) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlug = theme.slug;
    }
  }

  return bestSlug;
}

export function parseThemeFilter(value: string | null | undefined): string {
  if (!value) return ALL_THEME_SLUG;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === ALL_THEME_SLUG) return ALL_THEME_SLUG;
  return CURATED_SIGNAL_THEMES.some((theme) => theme.slug === normalized) ? normalized : ALL_THEME_SLUG;
}

export function mapSignalToCuratedTheme(signal: Signal): string {
  const text = normalizeText(`${signal.title} ${signal.summary} ${(signal.tags ?? []).join(" ")}`);
  const normalizedTags = (signal.tags ?? []).map((tag) => normalizeTag(tag));
  return themeForText(text, normalizedTags);
}

export function mapClaimToCuratedTheme(claim: NewsClaim): string {
  const text = normalizeText(`${claim.claimText} ${claim.category} ${claim.entities.join(" ")}`);
  return themeForText(text);
}

export function signalMatchesTheme(signal: Signal, themeSlug: string): boolean {
  if (!themeSlug || themeSlug === ALL_THEME_SLUG) return true;
  return mapSignalToCuratedTheme(signal) === themeSlug;
}

export function getCuratedThemeTitle(slug: string): string {
  return CURATED_SIGNAL_THEMES.find((theme) => theme.slug === slug)?.title ?? "Theme";
}

export function getSignalsThemeHref(slug: string): string {
  const parsed = parseThemeFilter(slug);
  if (parsed === ALL_THEME_SLUG) return "/fundgraph/signals";
  return `/fundgraph/signals?theme=${encodeURIComponent(parsed)}`;
}

export function getThemeFilterOptions(signals: Signal[]): Array<{ slug: string; title: string; count: number }> {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const slug = mapSignalToCuratedTheme(signal);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return CURATED_SIGNAL_THEMES.map((theme) => ({
    slug: theme.slug,
    title: theme.title,
    count: counts.get(theme.slug) ?? 0,
  })).filter((theme) => theme.count > 0);
}

