import { CitationRef, DealFact, Fund } from "@/lib/fundgraph/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const COMPANY_TOKEN_STOPWORDS = new Set([
  "ai",
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "group",
  "holdings",
  "technology",
  "technologies",
  "platform",
  "platforms",
  "systems",
  "labs",
  "lab",
]);

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyTokens(companyName: string): string[] {
  const normalized = normalizeText(companyName);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(" ")
        .filter((token) => token.length >= 3)
        .filter((token) => !COMPANY_TOKEN_STOPWORDS.has(token))
    )
  );
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function citationRefMatchesCompany(ref: CitationRef, companyName: string): boolean {
  const normalizedCompany = normalizeText(companyName);
  if (!normalizedCompany) return false;

  const normalizedNoSpace = normalizedCompany.replace(/\s+/g, "");
  const haystack = normalizeText([ref.title, ref.snippet ?? "", ref.url].filter(Boolean).join(" "));
  if (!haystack) return false;

  if (haystack.includes(normalizedCompany) || (normalizedNoSpace.length >= 5 && haystack.includes(normalizedNoSpace))) {
    return true;
  }

  const tokens = companyTokens(companyName);
  if (!tokens.length) return false;

  const hitCount = tokens.filter((token) => new RegExp(`\\b${escapeRegex(token)}\\b`, "i").test(haystack)).length;
  if (tokens.length === 1) return hitCount >= 1;
  return hitCount >= Math.min(2, tokens.length);
}

export function filterCitationRefsForCompany(companyName: string, refs: CitationRef[]): CitationRef[] {
  return refs.filter((ref) => citationRefMatchesCompany(ref, companyName));
}

export function normalizeCitationRefs(input: CitationRef[] | undefined): CitationRef[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: CitationRef[] = [];

  for (const ref of input) {
    if (!ref || typeof ref.url !== "string" || typeof ref.title !== "string") continue;
    const url = ref.url.trim();
    const title = ref.title.trim();
    if (!url || !title) continue;

    const key = `${url.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      id: ref.id?.trim() || `citation-${slugify(title)}-${normalized.length + 1}`,
      url,
      title,
      snippet: typeof ref.snippet === "string" ? ref.snippet.trim() : undefined,
      publishedAt: typeof ref.publishedAt === "string" ? ref.publishedAt : undefined,
      origin: ref.origin ?? "synthetic",
    });
  }

  return normalized;
}

export function citationCountForDealFact(dealFact: DealFact): number {
  if (typeof dealFact.citationCount === "number" && Number.isFinite(dealFact.citationCount)) {
    return Math.max(0, Math.floor(dealFact.citationCount));
  }
  return normalizeCitationRefs(dealFact.sourceRefs).length;
}

export function isDealFactVerified(dealFact: DealFact): boolean {
  if (dealFact.verified === false) return false;
  return citationCountForDealFact(dealFact) > 0;
}

export function normalizeDealFact(dealFact: DealFact): DealFact {
  const sourceRefs = filterCitationRefsForCompany(
    dealFact.companyName,
    normalizeCitationRefs(dealFact.sourceRefs)
  );
  const amountMinM = typeof dealFact.amountMinM === "number" && Number.isFinite(dealFact.amountMinM) ? dealFact.amountMinM : undefined;
  const amountMaxM = typeof dealFact.amountMaxM === "number" && Number.isFinite(dealFact.amountMaxM) ? dealFact.amountMaxM : undefined;
  const confidence = typeof dealFact.confidence === "number" && Number.isFinite(dealFact.confidence) ? clamp(dealFact.confidence, 0, 1) : undefined;

  return {
    ...dealFact,
    sourceRefs,
    amountMinM,
    amountMaxM,
    confidence,
    verified: isDealFactVerified({ ...dealFact, sourceRefs }),
    citationCount: sourceRefs.length,
  };
}

export function normalizeDealFactsForFund(fund: Fund): DealFact[] {
  if (!Array.isArray(fund.portfolioInvestments)) return [];

  const seen = new Set<string>();
  const normalized: DealFact[] = [];

  for (const raw of fund.portfolioInvestments) {
    if (!raw || typeof raw.companyName !== "string") continue;
    const companyName = raw.companyName.trim();
    if (!companyName) continue;

    const id = raw.id?.trim() || `deal-${fund.id}-${slugify(companyName)}-${normalized.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    normalized.push(
      normalizeDealFact({
        ...raw,
        id,
        fundId: raw.fundId?.trim() || fund.id,
        companyName,
      })
    );
  }

  return normalized;
}

export function dealFactByCompanyName(fund: Fund): Map<string, DealFact> {
  const map = new Map<string, DealFact>();
  for (const dealFact of normalizeDealFactsForFund(fund)) {
    map.set(dealFact.companyName.toLowerCase(), dealFact);
  }
  return map;
}
