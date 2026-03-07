import { Fund } from "@/lib/fundgraph/types";

type FundLike = Pick<Fund, "name" | "slug" | "description" | "sectors" | "stages" | "geography">;

export type FundOverview = {
  text: string;
};

const CURATED_OVERVIEWS: Record<string, string> = {
  "sequoia-capital": "Sequoia Capital is a multi-stage venture firm that backs technology companies from seed through growth across global markets.",
  "andreessen-horowitz":
    "Andreessen Horowitz (a16z) is a venture firm investing from seed to growth across software, AI, fintech, consumer, and infrastructure.",
  accel: "Accel is a global venture capital firm focused on early-stage technology companies and long-term company building.",
  benchmark: "Benchmark is an early-stage venture partnership known for concentrated, high-conviction investments in software and internet startups.",
  "bessemer-venture-partners":
    "Bessemer Venture Partners is a long-running venture firm investing in cloud, fintech, healthcare, cybersecurity, and AI companies.",
  "lightspeed-venture-partners":
    "Lightspeed Venture Partners is a multi-stage venture firm backing founders in enterprise, consumer, fintech, and frontier technology.",
  "general-catalyst":
    "General Catalyst is a global investment and transformation firm partnering with startups from early stage through growth.",
  "greylock-partners": "Greylock is an early-stage Silicon Valley venture firm focused on enterprise software, infrastructure, and consumer platforms.",
  "index-ventures": "Index Ventures is an international venture capital firm investing in technology startups from seed to growth.",
  "khosla-ventures": "Khosla Ventures backs mission-driven companies in AI, enterprise, healthcare, climate, and deep technology.",
  "founders-fund": "Founders Fund invests across stages in transformative companies spanning software, biotech, aerospace, and defense.",
  "first-round-capital":
    "First Round Capital is an early-stage venture firm focused on helping founders build durable, category-defining companies.",
  "union-square-ventures":
    "Union Square Ventures is an early-stage venture firm known for investing in network-enabled and software-first businesses.",
  "insight-partners":
    "Insight Partners is a global software investor focused on high-growth scale-up companies and expansion-stage businesses.",
  coatue: "Coatue is a global investment platform active across public markets, private growth, and venture-stage technology companies.",
  "tiger-global":
    "Tiger Global is an investment firm active in both public equities and private technology investments around the world.",
  nea: "NEA is a global venture capital firm investing across technology and healthcare from early stage through growth.",
  gv: "GV is Alphabet's venture arm, investing in startups across enterprise software, life sciences, consumer, and frontier technologies.",
  "kleiner-perkins":
    "Kleiner Perkins is a Silicon Valley venture firm investing in early and growth-stage technology and life sciences companies.",
  "ribbit-capital":
    "Ribbit Capital is a fintech-focused investment firm backing technology companies modernizing financial services.",
  "a16z-crypto":
    "a16z crypto is Andreessen Horowitz's crypto investment practice, backing web3 protocols, infrastructure, and application startups.",
  ivp: "IVP is a later-stage venture and growth investor focused on breakout technology companies.",
  "redpoint-ventures":
    "Redpoint Ventures is a multi-stage venture firm investing in founders across consumer and enterprise technology.",
  "craft-ventures":
    "Craft Ventures is a venture firm investing in early-stage software and marketplace companies with a strong operating focus.",
  "sapphire-ventures":
    "Sapphire Ventures is a venture capital firm focused on enterprise software companies from growth stage through scale.",
  madrona: "Madrona is a venture capital firm backing early-stage technology startups, with deep roots in the Pacific Northwest.",
  "menlo-ventures":
    "Menlo Ventures is a multi-stage venture firm investing in AI, enterprise software, healthcare, and consumer technology.",
  "battery-ventures":
    "Battery Ventures is a global investment firm supporting technology companies from seed-stage startups to growth businesses.",
  felicis: "Felicis is an early-stage venture firm investing across AI-native applications, infrastructure, and digital-first businesses.",
  "initialized-capital":
    "Initialized Capital is an early-stage venture firm that partners closely with founders from company formation through product-market fit.",
  "y-combinator":
    "Y Combinator is a startup accelerator and early-stage investor that funds founders at the earliest stages and supports them through launch.",
  nfx: "NFX is an early-stage venture firm focused on network effects, software platforms, and founder-led category creation.",
  "threshold-ventures":
    "Threshold Ventures is an early-stage venture firm backing enterprise and consumer technology companies.",
  "lux-capital":
    "Lux Capital invests in frontier science and technology companies spanning AI, robotics, biotech, climate, and defense.",
  dcvc: "DCVC is a deep-tech venture firm investing in science-driven companies across climate, life sciences, manufacturing, and AI.",
  tcv: "TCV is a growth equity firm investing in large-scale private and public technology companies.",
  "altimeter-capital":
    "Altimeter Capital is an investment firm focused on technology companies across growth-stage private markets and public equities.",
  "spark-capital":
    "Spark Capital is a multi-stage venture firm investing in product-led startups across software, consumer, and media technology.",
  "scale-venture-partners":
    "Scale Venture Partners is an early-in-growth venture firm focused on cloud software, AI, data infrastructure, and developer tools.",
  gic: "GIC is Singapore's sovereign wealth fund and a long-term global investor across public, private, and alternative asset classes.",
};

function normalizeFundKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function joinReadable(values: string[]): string {
  if (!values.length) return "";
  if (values.length === 1) return values[0] as string;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function cleanDescription(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/^[\s\-*•]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSignalSnippet(text: string, fundName: string): boolean {
  const lowered = text.toLowerCase();
  const fundLower = fundName.toLowerCase();
  if (!lowered) return true;
  if (/^\W/.test(text)) return true;
  if (lowered.includes("just raised") || lowered.includes("seed round") || lowered.includes("series ") || lowered.includes("valuation")) {
    return !lowered.includes(fundLower);
  }
  if (lowered.includes("startup") && !lowered.includes(fundLower)) return true;
  return false;
}

function metadataOverview(fund: FundLike): string {
  const sectors = uniq(fund.sectors ?? []).slice(0, 3);
  const stages = uniq(fund.stages ?? []).slice(0, 2);
  const geos = uniq(fund.geography ?? []).slice(0, 2);

  const sectorText = sectors.length ? joinReadable(sectors.map((item) => item.toLowerCase())) : "technology";
  const stageText = stages.length ? joinReadable(stages) : "early and growth";
  const geoText = geos.length ? ` with activity across ${joinReadable(geos)}.` : ".";

  return `${fund.name} is a venture capital firm investing in ${sectorText} across ${stageText} stages${geoText}`;
}

export function getFundOverview(fund: FundLike): FundOverview {
  const key = normalizeFundKey(fund.slug || fund.name);
  const curated = CURATED_OVERVIEWS[key];
  if (curated) return { text: curated };

  const cleaned = cleanDescription(fund.description);
  if (cleaned && !looksLikeSignalSnippet(cleaned, fund.name)) {
    return { text: cleaned };
  }

  return { text: metadataOverview(fund) };
}
