import { Fund } from "@/lib/fundgraph/types";

type CompanyProfile = {
  canonicalName: string;
  url?: string;
  founders: string[];
};

const FUND_LINKEDIN_BY_SLUG: Record<string, string> = {
  "sequoia-capital": "https://www.linkedin.com/company/sequoia/",
  "andreessen-horowitz": "https://www.linkedin.com/company/a16z/",
  accel: "https://www.linkedin.com/company/accel/",
  benchmark: "https://www.linkedin.com/company/benchmark-capital/",
  "bessemer-venture-partners": "https://www.linkedin.com/company/bessemer-venture-partners/",
  "lightspeed-venture-partners": "https://www.linkedin.com/company/lightspeed-venture-partners/",
  "general-catalyst": "https://www.linkedin.com/company/general-catalyst/",
  "greylock-partners": "https://www.linkedin.com/company/greylock-partners/",
  "index-ventures": "https://www.linkedin.com/company/index-ventures/",
  "khosla-ventures": "https://www.linkedin.com/company/khosla-ventures/",
  "founders-fund": "https://www.linkedin.com/company/founders-fund/",
  "first-round-capital": "https://www.linkedin.com/company/first-round-capital/",
  "union-square-ventures": "https://www.linkedin.com/company/union-square-ventures/",
  "insight-partners": "https://www.linkedin.com/company/insight--partners/",
  coatue: "https://www.linkedin.com/company/coatue-management/",
  "tiger-global": "https://www.linkedin.com/company/tiger-global-management/",
  nea: "https://www.linkedin.com/company/new-enterprise-associates/",
  gv: "https://www.linkedin.com/company/gv/",
  "kleiner-perkins": "https://www.linkedin.com/company/kleiner-perkins/",
  "ribbit-capital": "https://www.linkedin.com/company/ribbit-capital/",
  "a16z-crypto": "https://www.linkedin.com/showcase/a16zcrypto/",
  ivp: "https://www.linkedin.com/company/ivp/",
  "redpoint-ventures": "https://www.linkedin.com/company/redpoint-ventures/",
  "craft-ventures": "https://www.linkedin.com/company/craft-ventures/",
  "sapphire-ventures": "https://www.linkedin.com/company/sapphire-ventures/",
  madrona: "https://www.linkedin.com/company/madrona-ventures/",
  "menlo-ventures": "https://www.linkedin.com/company/menlo-ventures/",
  "battery-ventures": "https://www.linkedin.com/company/battery-ventures/",
  felicis: "https://www.linkedin.com/company/felicis-ventures/",
  "initialized-capital": "https://www.linkedin.com/company/initialized-capital/",
  "y-combinator": "https://www.linkedin.com/company/y-combinator/",
  nfx: "https://www.linkedin.com/company/nfxvc/",
  "threshold-ventures": "https://www.linkedin.com/company/threshold-ventures/",
  "lux-capital": "https://www.linkedin.com/company/lux-capital/",
  dcvc: "https://www.linkedin.com/company/dcvc/",
  tcv: "https://www.linkedin.com/company/technology-crossover-ventures/",
  "altimeter-capital": "https://www.linkedin.com/company/altimeter-capital/",
  "spark-capital": "https://www.linkedin.com/company/spark-capital/",
  "scale-venture-partners": "https://www.linkedin.com/company/scale-venture-partners/",
  gic: "https://www.linkedin.com/company/gic/",
};

const COMPANY_ALIASES: Record<string, string> = {
  "around nfxpalo alto networks": "Palo Alto Networks",
  "quantum scaleup pasqal": "Pasqal",
  "uk. monzo": "Monzo",
  space: "SpaceX",
};

const COMPANY_PROFILES: Record<string, CompanyProfile> = {
  "OpenAI": {
    canonicalName: "OpenAI",
    url: "https://openai.com",
    founders: ["Sam Altman", "Greg Brockman", "Ilya Sutskever"],
  },
  "Anthropic": {
    canonicalName: "Anthropic",
    url: "https://www.anthropic.com",
    founders: ["Dario Amodei", "Daniela Amodei", "Tom Brown"],
  },
  "Perplexity": {
    canonicalName: "Perplexity",
    url: "https://www.perplexity.ai",
    founders: ["Aravind Srinivas", "Denis Yarats", "Johnny Ho"],
  },
  "Scale AI": {
    canonicalName: "Scale AI",
    url: "https://scale.com",
    founders: ["Alexandr Wang", "Lucy Guo"],
  },
  "Databricks": {
    canonicalName: "Databricks",
    url: "https://www.databricks.com",
    founders: ["Ali Ghodsi", "Matei Zaharia", "Reynold Xin"],
  },
  "Stripe": {
    canonicalName: "Stripe",
    url: "https://stripe.com",
    founders: ["Patrick Collison", "John Collison"],
  },
  "Rippling": {
    canonicalName: "Rippling",
    url: "https://www.rippling.com",
    founders: ["Parker Conrad", "Prasanna Sankar"],
  },
  "Mercury": {
    canonicalName: "Mercury",
    url: "https://mercury.com",
    founders: ["Immad Akhund", "Jason Zhang", "Max Tagher"],
  },
  "Figma": {
    canonicalName: "Figma",
    url: "https://www.figma.com",
    founders: ["Dylan Field", "Evan Wallace"],
  },
  "Notion": {
    canonicalName: "Notion",
    url: "https://www.notion.so",
    founders: ["Ivan Zhao", "Simon Last"],
  },
  "Canva": {
    canonicalName: "Canva",
    url: "https://www.canva.com",
    founders: ["Melanie Perkins", "Cliff Obrecht", "Cameron Adams"],
  },
  "Pinecone": {
    canonicalName: "Pinecone",
    url: "https://www.pinecone.io",
    founders: ["Edo Liberty", "Mo Raviv"],
  },
  "Cohere": {
    canonicalName: "Cohere",
    url: "https://cohere.com",
    founders: ["Aidan Gomez", "Nick Frosst", "Ivan Zhang"],
  },
  "ElevenLabs": {
    canonicalName: "ElevenLabs",
    url: "https://elevenlabs.io",
    founders: ["Mati Staniszewski", "Piotr Dabkowski"],
  },
  "Harvey": {
    canonicalName: "Harvey",
    url: "https://www.harvey.ai",
    founders: ["Winston Weinberg", "Gabriel Pereyra"],
  },
  "Ramp": {
    canonicalName: "Ramp",
    url: "https://ramp.com",
    founders: ["Eric Glyman", "Karim Atiyeh"],
  },
  "Vercel": {
    canonicalName: "Vercel",
    url: "https://vercel.com",
    founders: ["Guillermo Rauch"],
  },
  "Linear": {
    canonicalName: "Linear",
    url: "https://linear.app",
    founders: ["Karri Saarinen", "Jori Lallo", "Tuomas Artman"],
  },
  "Datadog": {
    canonicalName: "Datadog",
    url: "https://www.datadoghq.com",
    founders: ["Olivier Pomel", "Alexis Le-Quoc"],
  },
  "Snyk": {
    canonicalName: "Snyk",
    url: "https://snyk.io",
    founders: ["Guy Podjarny", "Danny Grander", "Assaf Hefetz"],
  },
  "Mistral": {
    canonicalName: "Mistral",
    url: "https://mistral.ai",
    founders: ["Arthur Mensch", "Guillaume Lample", "Timothee Lacroix"],
  },
  "Runway": {
    canonicalName: "Runway",
    url: "https://runwayml.com",
    founders: ["Cristobal Valenzuela", "Alejandro Matamala", "Anastasis Germanidis"],
  },
  "Science Corp": {
    canonicalName: "Science Corp",
    url: "https://science.xyz",
    founders: ["Max Hodak"],
  },
  "Palo Alto Networks": {
    canonicalName: "Palo Alto Networks",
    url: "https://www.paloaltonetworks.com",
    founders: ["Nir Zuk"],
  },
  "Pasqal": {
    canonicalName: "Pasqal",
    url: "https://www.pasqal.com",
    founders: ["Georges-Olivier Reymond", "Alain Aspect", "Christophe Jurczak"],
  },
  "Monzo": {
    canonicalName: "Monzo",
    url: "https://monzo.com",
    founders: ["Tom Blomfield", "Gary Dolman", "Jonas Huckestein"],
  },
  "Meta": {
    canonicalName: "Meta",
    url: "https://about.meta.com",
    founders: ["Mark Zuckerberg", "Dustin Moskovitz", "Chris Hughes"],
  },
  "SpaceX": {
    canonicalName: "SpaceX",
    url: "https://www.spacex.com",
    founders: ["Elon Musk"],
  },
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeToken(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function getFundLinkedinUrl(fund: Pick<Fund, "slug" | "name">): string | undefined {
  const bySlug = FUND_LINKEDIN_BY_SLUG[fund.slug];
  if (bySlug) return bySlug;
  const normalized = slugify(fund.name);
  return FUND_LINKEDIN_BY_SLUG[normalized];
}

export function normalizePortfolioCompanyName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return rawName;
  const alias = COMPANY_ALIASES[normalizeToken(trimmed)];
  if (alias) return alias;
  const direct = COMPANY_PROFILES[trimmed];
  return direct?.canonicalName ?? trimmed;
}

export function getPortfolioCompanyProfile(rawName: string): CompanyProfile | undefined {
  const normalized = normalizePortfolioCompanyName(rawName);
  return COMPANY_PROFILES[normalized];
}

export function getPortfolioCompanyUrl(rawName: string): string | undefined {
  return getPortfolioCompanyProfile(rawName)?.url;
}

export function getFoundersFromPortfolio(portfolio: string[], limit = 6): string[] {
  const names: string[] = [];
  for (const company of portfolio) {
    const founders = getPortfolioCompanyProfile(company)?.founders ?? [];
    for (const founder of founders) {
      names.push(founder);
      if (names.length >= limit * 2) break;
    }
    if (names.length >= limit * 2) break;
  }
  return uniq(names).slice(0, limit);
}

export function deriveCoInvestorsFromPortfolioUniverse(funds: Fund[], targetFund: Fund, limit = 6): string[] {
  const targetPortfolio = new Set(targetFund.portfolio.map((company) => normalizeToken(normalizePortfolioCompanyName(company))));
  if (!targetPortfolio.size) return [];

  const overlap: Array<{ fundName: string; count: number }> = [];
  for (const candidate of funds) {
    if (candidate.id === targetFund.id) continue;
    let count = 0;
    for (const company of candidate.portfolio) {
      const normalized = normalizeToken(normalizePortfolioCompanyName(company));
      if (targetPortfolio.has(normalized)) count += 1;
    }
    if (count > 0) overlap.push({ fundName: candidate.name, count });
  }

  return overlap
    .sort((left, right) => (right.count === left.count ? left.fundName.localeCompare(right.fundName) : right.count - left.count))
    .map((entry) => entry.fundName)
    .slice(0, limit);
}
