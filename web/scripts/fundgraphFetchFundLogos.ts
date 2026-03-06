import fs from "fs/promises";
import path from "path";

type FundRecord = {
  id: string;
  name: string;
  gp?: { photoUrl?: string };
};

type WikiPageInfo = {
  title?: string;
  missing?: unknown;
  pageprops?: {
    wikibase_item?: string;
  };
};

type WikiSearchRow = {
  title?: string;
};

type WikidataWebsiteClaim = {
  mainsnak?: {
    datavalue?: {
      value?: string;
    };
  };
};

const ROOT = process.cwd();
const SEED_FUNDS_PATH = path.join(ROOT, "src", "lib", "fundgraph", "seed", "funds.json");
const PUBLIC_FUNDS_PATH = path.join(ROOT, "public", "data", "fundgraph", "funds.json");
const LOGO_DIR = path.join(ROOT, "public", "data", "fundgraph", "fund-logos");

const USER_AGENT = "CerebrosFundGraph/1.0 (logo-fetch)";

const DOMAIN_OVERRIDES: Record<string, string> = {
  Accel: "accel.com",
  Benchmark: "benchmark.com",
  Coatue: "coatue.com",
  "Tiger Global": "tigerglobal.com",
  "Kleiner Perkins": "kleinerperkins.com",
  "a16z Crypto": "a16z.com",
  "Redpoint Ventures": "redpointvc.com",
  Madrona: "madrona.com",
  Felicis: "felicis.com",
  "Threshold Ventures": "threshold.vc",
  "Altimeter Capital": "altimeter.com",
  GV: "gv.com",
  TCV: "tcv.com",
  IVP: "ivp.com",
  GIC: "gic.com",
  NFX: "nfx.com",
  DCVC: "dcvc.com",
  NEA: "nea.com",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length > 2)
      .filter((token) => !["capital", "partners", "ventures", "venture", "fund", "funds", "firm", "crypto"].includes(token))
  );
}

function overlapScore(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function wikipediaTitleExists(title: string): Promise<string | null> {
  const payload = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=info&titles=${encodeURIComponent(title)}`
  );
  const pages = (payload as { query?: { pages?: Record<string, WikiPageInfo> } } | null)?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  if (!page || page.missing !== undefined) return null;
  return typeof page.title === "string" ? page.title : title;
}

async function searchWikipediaTitle(fundName: string): Promise<string | null> {
  const directAttempts = [
    fundName,
    `${fundName} (venture capital firm)`,
    `${fundName} Partners`,
    `${fundName} Capital`,
  ];

  for (const candidate of directAttempts) {
    const found = await wikipediaTitleExists(candidate);
    if (found) return found;
    await delay(70);
  }

  const searchPayload = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=10&srsearch=${encodeURIComponent(
      `${fundName} venture capital`
    )}`
  );
  const rows = Array.isArray((searchPayload as { query?: { search?: WikiSearchRow[] } } | null)?.query?.search)
    ? ((searchPayload as { query?: { search?: WikiSearchRow[] } }).query?.search ?? [])
    : [];
  if (!rows.length) return null;

  const best = [...rows]
    .map((row) => ({ title: String(row.title ?? ""), score: overlapScore(fundName, String(row.title ?? "")) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 0.25) return null;
  return best.title;
}

async function resolveWebsiteDomainFromWikipedia(fundName: string): Promise<string | null> {
  if (DOMAIN_OVERRIDES[fundName]) return DOMAIN_OVERRIDES[fundName];

  const title = await searchWikipediaTitle(fundName);
  if (!title) return null;

  const pagePropsPayload = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageprops&titles=${encodeURIComponent(title)}`
  );
  const pages = (pagePropsPayload as { query?: { pages?: Record<string, WikiPageInfo> } } | null)?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  const wikibaseItem = page?.pageprops?.wikibase_item;
  if (!wikibaseItem) return null;

  const wikidataPayload = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${wikibaseItem}.json`);
  const claims = (
    wikidataPayload as { entities?: Record<string, { claims?: { P856?: WikidataWebsiteClaim[] } }> } | null
  )?.entities?.[wikibaseItem]?.claims?.P856;
  if (!Array.isArray(claims) || !claims.length) return null;

  for (const claim of claims) {
    const website = claim?.mainsnak?.datavalue?.value;
    if (typeof website !== "string") continue;
    try {
      const domain = new URL(website).hostname.replace(/^www\./, "").trim().toLowerCase();
      if (domain) return domain;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchLogo(domain: string): Promise<Buffer | null> {
  try {
    const response = await fetch(`https://icon.horse/icon/${encodeURIComponent(domain)}`, {
      headers: { "user-agent": USER_AGENT },
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 200) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function ensureLogoDir(): Promise<void> {
  await fs.mkdir(LOGO_DIR, { recursive: true });
}

function logoPathForFund(fundId: string): { absolute: string; publicPath: string } {
  const filename = `${fundId}.png`;
  return {
    absolute: path.join(LOGO_DIR, filename),
    publicPath: `/data/fundgraph/fund-logos/${filename}`,
  };
}

async function applyLogosToFunds(funds: FundRecord[]): Promise<{ updated: FundRecord[]; fetched: number; unresolved: number }> {
  const domainByName = new Map<string, string | null>();
  const bytesByDomain = new Map<string, Buffer | null>();
  let fetched = 0;
  let unresolved = 0;

  const updated: FundRecord[] = [];
  for (const fund of funds) {
    const currentPath = fund.gp?.photoUrl ?? "";
    const hasExisting = currentPath.startsWith("/data/fundgraph/fund-logos/");

    let domain = domainByName.get(fund.name);
    if (domain === undefined) {
      domain = await resolveWebsiteDomainFromWikipedia(fund.name);
      domainByName.set(fund.name, domain ?? null);
      await delay(120);
    }

    let bytes: Buffer | null = null;
    if (domain) {
      bytes = bytesByDomain.get(domain) ?? null;
      if (bytesByDomain.get(domain) === undefined) {
        bytes = await fetchLogo(domain);
        bytesByDomain.set(domain, bytes ?? null);
        await delay(90);
      }
    }

    if (!bytes) {
      updated.push(fund);
      if (!hasExisting) unresolved += 1;
      continue;
    }

    const logoPath = logoPathForFund(fund.id);
    await fs.writeFile(logoPath.absolute, bytes);
    fetched += 1;

    updated.push({
      ...fund,
      gp: {
        ...(fund.gp ?? {}),
        photoUrl: logoPath.publicPath,
      },
    });
  }

  return { updated, fetched, unresolved };
}

async function main() {
  await ensureLogoDir();

  const seedFunds = await readJson<FundRecord[]>(SEED_FUNDS_PATH);
  const publicFunds = await readJson<FundRecord[]>(PUBLIC_FUNDS_PATH);

  const seedResult = await applyLogosToFunds(seedFunds);
  const publicById = new Map(publicFunds.map((fund) => [fund.id, fund]));
  const mergedPublic = seedResult.updated.map((seedFund) => {
    const existing = publicById.get(seedFund.id);
    if (!existing) return seedFund;
    return {
      ...existing,
      gp: {
        ...(existing.gp ?? {}),
        photoUrl: seedFund.gp?.photoUrl,
      },
    };
  });

  await writeJson(SEED_FUNDS_PATH, seedResult.updated);
  await writeJson(PUBLIC_FUNDS_PATH, mergedPublic);

  console.log(`Fund logo fetch complete.`);
  console.log(`Fetched logos: ${seedResult.fetched}`);
  console.log(`Unresolved funds kept as-is: ${seedResult.unresolved}`);
  console.log(`Output directory: ${LOGO_DIR}`);
}

main().catch((error) => {
  console.error("fundgraphFetchFundLogos failed", error);
  process.exitCode = 1;
});
