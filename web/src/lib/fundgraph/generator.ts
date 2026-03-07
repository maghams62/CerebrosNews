import { Fund, FundCategory, FundGraphDataMode, FundStage, GraphEdge, RiskTolerance, Signal, SyntheticFundgraphDataset } from "@/lib/fundgraph/types";

const FUND_PREFIXES = [
  "North",
  "Summit",
  "Arc",
  "Catalyst",
  "Bridge",
  "Signal",
  "Vertex",
  "Pioneer",
  "Mosaic",
  "Granite",
  "Harbor",
  "Orbit",
  "Keystone",
  "Meridian",
  "Anchor",
  "Helix",
  "Crest",
  "Vector",
];

const FUND_SUFFIXES = ["Capital", "Ventures", "Partners", "Growth", "Collective", "Labs", "Fund", "Holdings"];

const GP_FIRST = [
  "Amara",
  "Liam",
  "Sofia",
  "Nolan",
  "Maya",
  "Arjun",
  "Ethan",
  "Zoe",
  "Rhea",
  "Kai",
  "Noah",
  "Ava",
  "Iris",
  "Milo",
  "Leah",
  "Rowan",
];

const GP_LAST = [
  "Patel",
  "Chen",
  "Rivera",
  "Kim",
  "Shah",
  "Morris",
  "Nguyen",
  "Bell",
  "Khan",
  "Wright",
  "Stone",
  "Foster",
  "Ali",
  "Brooks",
  "Parker",
  "Clark",
];

const CITIES = [
  "San Francisco, US",
  "New York, US",
  "Boston, US",
  "Austin, US",
  "Seattle, US",
  "London, UK",
  "Berlin, DE",
  "Singapore, SG",
  "Bengaluru, IN",
  "Toronto, CA",
];

const GEOS = ["US", "Europe", "India", "APAC", "LatAm", "Middle East"];

const STAGES: FundStage[] = ["Pre-Seed", "Seed", "Series A", "Series B+", "Growth"];

const SECTORS: FundCategory[] = [
  "AI",
  "Developer Tools",
  "Fintech",
  "Cloud",
  "Security",
  "Climate",
  "Bio",
  "Consumer",
  "Enterprise",
  "Web3",
  "Data Infrastructure",
  "Robotics",
  "Health",
  "Semiconductors",
];

const RISK_LEVELS: RiskTolerance[] = ["low", "medium", "high"];

const PORTFOLIO_COMPANIES = [
  "Ramp",
  "Vercel",
  "Perplexity",
  "Scale AI",
  "Cursor",
  "Hightouch",
  "Rippling",
  "Mercury",
  "Figma",
  "Datadog",
  "Canva",
  "Notion",
  "Anthropic",
  "Mistral",
  "Synthesia",
  "OpenBB",
  "Retool",
  "Plaid",
  "Abnormal",
  "Cohere",
  "Runway",
  "Harvey",
  "ElevenLabs",
  "Airtable",
  "Linear",
  "Cribl",
  "Luma",
  "Pinecone",
  "Snyk",
  "Cartesia",
  "Windsurf",
  "Glean",
];

const GP_PRIOR_FIRMS = [
  "Sequoia Capital",
  "Accel",
  "Bessemer",
  "Lightspeed",
  "Andreessen Horowitz",
  "General Catalyst",
  "Index Ventures",
  "Greylock",
];

const PARTNER_NETWORK_COMPANIES = [
  "Google",
  "OpenAI",
  "Stripe",
  "Meta",
  "Nvidia",
  "Snowflake",
  "Databricks",
  "Microsoft",
];

const CO_INVESTORS = [
  "Sequoia",
  "Benchmark",
  "Lightspeed",
  "Index",
  "General Catalyst",
  "Greylock",
  "Coatue",
  "Founders Fund",
];

const FOUNDER_NAMES = [
  "Aarav Mehta",
  "Julia Chen",
  "Nadia Kim",
  "Daniel Ortiz",
  "Ravi Patel",
  "Chloe Park",
  "Mina Shah",
  "Ethan Cole",
];

const TOP_EXITS = [
  "Datadog",
  "Figma",
  "GitHub",
  "Snowflake",
  "Nubank",
  "Twilio",
  "MongoDB",
  "Cloudflare",
];

const SIGNAL_TEMPLATES = [
  "Portfolio hiring velocity is accelerating across core AI infra roles.",
  "Partner checks indicate stronger Series A follow-on demand than last quarter.",
  "Recent co-invest patterns suggest increasing conviction from crossover funds.",
  "Portfolio gross margin trend improved for three consecutive months.",
  "Fund is leading earlier rounds with tighter ownership targets this cycle.",
  "GP network sourced two late-stage opportunities in enterprise security.",
  "Secondary market chatter indicates favorable mark-to-market momentum.",
  "Fund has increased thematic focus on applied AI in regulated industries.",
  "Operator references highlight exceptional support quality during GTM ramps.",
  "LP update emphasizes capital-efficient growth and disciplined pricing.",
];

function pick<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length] as T;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function toKusdRange(minM: number, maxM: number): { min: number; max: number } {
  return {
    min: Math.max(10, Math.round(minM * 1000)),
    max: Math.max(10, Math.round(maxM * 1000)),
  };
}

function toScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createSyntheticFunds(count = 90): Fund[] {
  const funds: Fund[] = [];

  for (let i = 0; i < count; i += 1) {
    const prefix = pick(FUND_PREFIXES, i);
    const suffix = pick(FUND_SUFFIXES, i * 3 + 1);
    const name = `${prefix} ${suffix} ${Math.floor(i / (FUND_PREFIXES.length * 1.4)) + 1}`;
    const stages = uniq([pick(STAGES, i), pick(STAGES, i + 1)]);
    const sectors = uniq([pick(SECTORS, i * 2), pick(SECTORS, i * 2 + 3)]);
    const gpFirst = pick(GP_FIRST, i * 2 + 1);
    const gpLast = pick(GP_LAST, i * 5 + 2);
    const gpName = `${gpFirst} ${gpLast}`;

    const checkSizeMinM = Number((0.5 + (i % 5) * 0.5).toFixed(1));
    const checkSizeMaxM = Number((3 + (i % 7) * 2).toFixed(1));
    const aumM = 180 + (i % 24) * 55;
    const trendScore = 54 + ((i * 11) % 44);
    const momentumScore = 50 + ((i * 13) % 46);
    const communityScore = 45 + ((i * 7) % 51);
    const geography = uniq([pick(GEOS, i), pick(GEOS, i + 2)]);
    const leadInvestmentRate = 50 + (i % 26);
    const followOnRate = 40 + (i % 24);

    funds.push({
      id: `fund-${i + 1}`,
      slug: slugify(name),
      name,
      description: `${name} backs category-defining founders building durable software businesses with clear distribution advantages.`,
      headquarters: pick(CITIES, i),
      geography,
      geographies: geography,
      stages,
      sectors,
      checkSizeMinM,
      checkSizeMaxM,
      checkSizeKUsd: toKusdRange(checkSizeMinM, checkSizeMaxM),
      aumM,
      vintageYear: 2012 + (i % 14),
      trendScore: toScore(trendScore),
      momentumScore: toScore(momentumScore),
      communityScore: toScore(communityScore),
      risk: pick(RISK_LEVELS, i + 1),
      fundType: `${sectors[0]} ${stages[0]} Fund`,
      gp: {
        name: gpName,
        title: "General Partner",
        bio: `${gpFirst} has operated across product and investing, with a focus on early-stage software and repeat founder networks.`,
        previousFirms: [pick(GP_PRIOR_FIRMS, i), pick(GP_PRIOR_FIRMS, i + 3)],
        linkedinUrl: `https://www.linkedin.com/in/${slugify(gpName)}`,
        photoUrl: `/data/fundgraph/fund-logos/fund-${i + 1}.png`,
        focusAreas: sectors.slice(0, 2),
        partnerNetwork: [pick(PARTNER_NETWORK_COMPANIES, i), pick(PARTNER_NETWORK_COMPANIES, i + 4)],
      },
      gpNames: [gpName],
      portfolio: [
        pick(PORTFOLIO_COMPANIES, i),
        pick(PORTFOLIO_COMPANIES, i + 4),
        pick(PORTFOLIO_COMPANIES, i + 9),
        pick(PORTFOLIO_COMPANIES, i + 13),
        pick(PORTFOLIO_COMPANIES, i + 19),
      ],
      portfolioMetrics: {
        portfolioSize: 20 + (i % 22),
        leadInvestmentRate,
        followOnRate,
        topExits: [pick(TOP_EXITS, i), pick(TOP_EXITS, i + 2)],
      },
      coInvestors: [pick(CO_INVESTORS, i), pick(CO_INVESTORS, i + 2), pick(CO_INVESTORS, i + 4)],
      founders: [pick(FOUNDER_NAMES, i), pick(FOUNDER_NAMES, i + 2), pick(FOUNDER_NAMES, i + 5)],
      strategy:
        "Concentrated early-stage strategy focused on B2B software, with high-conviction ownership and active support in hiring, pricing, and GTM execution.",
      thesis: "Signals-driven conviction with deep sector research and repeat founder access.",
    });
  }

  return funds;
}

export function createSyntheticSignals(funds: Fund[], count = 260): Signal[] {
  const now = Date.now();
  const signals: Signal[] = [];

  for (let i = 0; i < count; i += 1) {
    const fund = funds[i % funds.length];
    const template = pick(SIGNAL_TEMPLATES, i * 2 + 1);
    const createdAt = new Date(now - i * 1000 * 60 * 35).toISOString();
    const verifies = (i * 3) % 12;
    const disagrees = (i * 2) % 6;

    signals.push({
      id: `signal-${i + 1}`,
      fundId: fund.id,
      title: `${fund.name}: ${template.split(" ").slice(0, 7).join(" ")}...`,
      summary: template,
      confidence: Number((0.56 + ((i * 13) % 40) / 100).toFixed(2)),
      upvotes: 4 + ((i * 9) % 55),
      verifiedCount: verifies,
      verifies,
      disagrees,
      commentsCount: (i * 5) % 9,
      authorName: `Analyst ${((i % 9) + 1).toString()}`,
      userId: `analyst-${(i % 9) + 1}`,
      createdAt,
      tags: [...fund.sectors.slice(0, 2), ...fund.stages.slice(0, 1)],
      source: i % 3 === 0 ? "system" : "community",
      evidence:
        i % 3 === 0
          ? {
              url: "https://www.reuters.com",
              snippet: "Channel checks and operator references indicate sustained enterprise demand.",
            }
          : undefined,
      evidenceUrl: i % 3 === 0 ? "https://www.reuters.com" : undefined,
      evidenceSnippet:
        i % 3 === 0
          ? "Channel checks and operator references indicate sustained enterprise demand."
          : undefined,
    });
  }

  return signals;
}

export function createSyntheticGraphEdges(funds: Fund[], signals: Signal[]): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const fund of funds) {
    for (const gpName of fund.gpNames) {
      edges.push({
        id: `edge-${fund.id}-gp-${slugify(gpName)}`,
        fromType: "fund",
        fromId: fund.id,
        toType: "gp",
        toId: gpName,
        relation: "managed_by",
        weight: 1,
      });
    }

    for (const company of fund.portfolio) {
      edges.push({
        id: `edge-${fund.id}-pf-${slugify(company)}`,
        fromType: "fund",
        fromId: fund.id,
        toType: "portfolio",
        toId: company,
        relation: "invested_in",
        weight: 1,
      });
    }
  }

  for (const signal of signals) {
    edges.push({
      id: `edge-${signal.id}-fund`,
      fromType: "signal",
      fromId: signal.id,
      toType: "fund",
      toId: signal.fundId,
      relation: "signal_about",
      weight: Number((0.4 + signal.confidence * 0.6).toFixed(2)),
    });
  }

  return edges;
}

export function generateSyntheticFundgraphDataset(params?: {
  seed?: string;
  mode?: FundGraphDataMode;
  fundCount?: number;
  signalCount?: number;
}): SyntheticFundgraphDataset {
  const fundCount = Math.max(50, Math.min(150, params?.fundCount ?? 90));
  const signalsTarget = Math.max(200, params?.signalCount ?? 260);

  const funds = createSyntheticFunds(fundCount);
  const signals = createSyntheticSignals(funds, signalsTarget);
  const graphEdges = createSyntheticGraphEdges(funds, signals);

  return {
    generatedAt: new Date().toISOString(),
    version: "1.1.0",
    funds,
    signals,
    graphEdges,
  };
}
