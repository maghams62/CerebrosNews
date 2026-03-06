import { FundgraphDbFile, Source } from "@/lib/fundgraph/types";
import { canonicalizeUrl, domainFromUrl, isLikelyTestText, normalizeName } from "./utils";

const BLOCKED_SOURCE_DOMAINS = new Set(["example.com", "fundgraph.local"]);
const BLOCKED_SOURCE_TITLES = new Set([
  "integration test source",
  "verification api test source",
  "test source",
]);

const HARD_SCRAPE_NOISE_PATTERNS: RegExp[] = [
  /\berror\s*404\b/i,
  /\bpage\s+not\s+found/i,
  /\bnot\s+found\b/i,
  /\bthis\s+page\s+could\s+not\s+be\s+found/i,
  /\bwe couldn['’]t find the page\b/i,
  /\bsorry,\s*this page could not be found\b/i,
  /\bskip\s+to\s+content/i,
  /\bskip\s+to\s+main\s+content/i,
  /\bclose\s*menu/i,
  /\bopen\s*menu/i,
  /\btoggle\s*menu/i,
  /\bgo\s+home\b/i,
  /\bget\s+in\s+touch\b/i,
  /\bmade\s+with\s+webflow\b/i,
  /privacy\s*policy/i,
  /terms\s*of\s*use/i,
  /policy\s+against\s+harassment/i,
  /\bofficial\s+website\b/i,
  /\bfirm\s+profile\b/i,
  /\bprevious\s+slide\b/i,
  /\bnext\s+slide\b/i,
  /\bread\s+full\s+article\b/i,
  /\ball\s+rights\s+reserved\b/i,
  /\bhome\s*team\s*founders?\b/i,
  /\bportfolio\s*publications?\b/i,
  /\bbuilding\s+great\s+companies\s+is\s+a\s+craft\b/i,
  /\bmore\s+info:\s*@/i,
  /\b\d{2,5}\s+[A-Za-z0-9.\- ]{2,40}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b/i,
];

function hasHardScrapeNoise(input: string | undefined): boolean {
  const value = String(input ?? "");
  if (!value) return false;
  return HARD_SCRAPE_NOISE_PATTERNS.some((pattern) => pattern.test(value));
}

function sourceLooksLikeNoise(source: Source): boolean {
  const domain = domainFromUrl(canonicalizeUrl(source.url));
  if (domain && BLOCKED_SOURCE_DOMAINS.has(domain)) return true;
  const title = normalizeName(source.title);
  if (BLOCKED_SOURCE_TITLES.has(title)) return true;
  if (isLikelyTestText(source.title)) return true;
  if (isLikelyTestText(source.rawText)) return true;
  if (hasHardScrapeNoise(source.title) || hasHardScrapeNoise(source.rawText)) return true;
  return false;
}

export function cleanupDbNoise(db: FundgraphDbFile): {
  db: FundgraphDbFile;
  removedSources: number;
  removedClaims: number;
  removedSignals: number;
  removedClaimLinks: number;
  removedVerifications: number;
  removedConflicts: number;
} {
  const originalSourceCount = db.sources?.length ?? 0;
  const keptSources = (db.sources ?? []).filter((source) => !sourceLooksLikeNoise(source));
  const removedSourceIds = new Set((db.sources ?? []).filter((source) => sourceLooksLikeNoise(source)).map((source) => source.id));

  const originalClaimsCount = db.claims.length;
  const keptClaims = db.claims.filter((claim) => {
    if (removedSourceIds.has(claim.sourceId)) return false;
    if (isLikelyTestText(claim.claimText)) return false;
    if (hasHardScrapeNoise(claim.claimText) || hasHardScrapeNoise(claim.citation?.title) || hasHardScrapeNoise(claim.citation?.snippet)) return false;
    const citationUrl = canonicalizeUrl(claim.citation?.url);
    const citationDomain = domainFromUrl(citationUrl);
    if (citationDomain && BLOCKED_SOURCE_DOMAINS.has(citationDomain)) return false;
    return true;
  });
  const removedClaimIds = new Set(db.claims.filter((claim) => !keptClaims.includes(claim)).map((claim) => claim.id));

  const originalSignalsCount = db.signals.length;
  const keptSignals = db.signals.filter((signal) => {
    const evidenceUrl = canonicalizeUrl(signal.evidenceUrl ?? signal.evidence?.url);
    const evidenceDomain = domainFromUrl(evidenceUrl);
    if (evidenceDomain && BLOCKED_SOURCE_DOMAINS.has(evidenceDomain)) return false;
    if (isLikelyTestText(signal.title) || isLikelyTestText(signal.summary)) return false;
    if (
      hasHardScrapeNoise(signal.title) ||
      hasHardScrapeNoise(signal.summary) ||
      hasHardScrapeNoise(signal.evidenceSnippet ?? signal.evidence?.snippet) ||
      hasHardScrapeNoise(signal.articleSnapshot?.headline) ||
      hasHardScrapeNoise(signal.articleSnapshot?.excerpt)
    ) {
      return false;
    }
    if (signal.sourceId && removedSourceIds.has(signal.sourceId)) return false;
    return true;
  });

  const originalClaimLinksCount = db.claimLinks?.length ?? 0;
  const keptClaimLinks = (db.claimLinks ?? []).filter((link) => !removedClaimIds.has(link.claimId));

  const originalVerificationsCount = db.verifications.length;
  const keptVerifications = db.verifications.filter((verification) => {
    if (verification.claimId && removedClaimIds.has(verification.claimId)) return false;
    return true;
  });

  const originalConflictsCount = db.conflicts.length;
  const keptConflicts = db.conflicts.filter(
    (conflict) => !removedClaimIds.has(conflict.claimIdA) && !removedClaimIds.has(conflict.claimIdB)
  );

  return {
    db: {
      ...db,
      sources: keptSources,
      claims: keptClaims,
      signals: keptSignals,
      claimLinks: keptClaimLinks,
      verifications: keptVerifications,
      conflicts: keptConflicts,
    },
    removedSources: Math.max(0, originalSourceCount - keptSources.length),
    removedClaims: Math.max(0, originalClaimsCount - keptClaims.length),
    removedSignals: Math.max(0, originalSignalsCount - keptSignals.length),
    removedClaimLinks: Math.max(0, originalClaimLinksCount - keptClaimLinks.length),
    removedVerifications: Math.max(0, originalVerificationsCount - keptVerifications.length),
    removedConflicts: Math.max(0, originalConflictsCount - keptConflicts.length),
  };
}

export function isBlockedTestSource(source: Source): boolean {
  return sourceLooksLikeNoise(source);
}
