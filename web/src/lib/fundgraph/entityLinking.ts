import { createId } from "@/lib/fundgraph/ids";
import { fundCompanyRecords, fundGpRecords, normalizeMatchText } from "@/lib/fundgraph/fundEntities";
import { readFunds } from "@/lib/fundgraph/storage";
import { ClaimLink, ClaimLinkTargetType, Fund, NewsClaim } from "@/lib/fundgraph/types";

interface LinkTarget {
  targetType: ClaimLinkTargetType;
  targetId: string;
  targetName: string;
  fundId: string;
  normalized: string;
}

function bigrams(input: string): string[] {
  if (input.length <= 2) return [input];
  const out: string[] = [];
  for (let i = 0; i < input.length - 1; i += 1) {
    out.push(input.slice(i, i + 2));
  }
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  const aMap = new Map<string, number>();

  for (const token of aBigrams) {
    aMap.set(token, (aMap.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of bBigrams) {
    const count = aMap.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      aMap.set(token, count - 1);
    }
  }

  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

function buildTargets(funds: Fund[]): LinkTarget[] {
  const targets: LinkTarget[] = [];

  for (const fund of funds) {
    targets.push({
      targetType: "FUND",
      targetId: fund.id,
      targetName: fund.name,
      fundId: fund.id,
      normalized: normalizeMatchText(fund.name),
    });

    for (const gp of fundGpRecords(fund)) {
      targets.push({
        targetType: "GP",
        targetId: gp.id,
        targetName: gp.name,
        fundId: fund.id,
        normalized: normalizeMatchText(gp.name),
      });
    }

    for (const company of fundCompanyRecords(fund)) {
      targets.push({
        targetType: "COMPANY",
        targetId: company.id,
        targetName: company.name,
        fundId: fund.id,
        normalized: normalizeMatchText(company.name),
      });
    }
  }

  return targets.filter((target) => target.normalized.length >= 3);
}

function candidateMentions(claim: NewsClaim): string[] {
  const entities = claim.entities
    .map((entity) => normalizeMatchText(entity))
    .filter((entity) => entity.length >= 3);

  const fromClaimText = (claim.claimText.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3})\b/g) ?? [])
    .map((entry) => normalizeMatchText(entry))
    .filter((entry) => entry.length >= 3);

  const citation = normalizeMatchText(claim.citation.snippet);
  const textBody = normalizeMatchText(`${claim.claimText} ${claim.entities.join(" ")}`);

  return [...entities, ...fromClaimText, citation, textBody];
}

function scoreMatch(target: LinkTarget, mentions: string[]): { score: number; matchedText?: string } {
  let bestScore = 0;
  let matchedText: string | undefined;

  for (const mention of mentions) {
    if (!mention) continue;

    let score = 0;
    if (mention === target.normalized) {
      score = 1;
    } else {
      const escaped = target.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const boundaryPattern = new RegExp(`\\b${escaped}\\b`, "i");
      if (boundaryPattern.test(mention)) {
        score = Math.max(score, 0.93);
      } else if (target.normalized.includes(mention) && mention.length >= 5) {
        const mentionTokens = new Set(mention.split(" ").filter((token) => token.length >= 3));
        const targetTokens = new Set(target.normalized.split(" ").filter((token) => token.length >= 3));
        let overlap = 0;
        for (const token of mentionTokens) {
          if (targetTokens.has(token)) overlap += 1;
        }
        const ratio = mentionTokens.size ? overlap / mentionTokens.size : 0;
        if (ratio >= 0.8) score = Math.max(score, 0.87);
      }
    }

    const dice = diceSimilarity(mention, target.normalized);
    if (dice >= 0.94) score = Math.max(score, 0.9);
    else if (dice >= 0.88) score = Math.max(score, 0.84);
    else if (dice >= 0.8) score = Math.max(score, 0.76);

    if (score > bestScore) {
      bestScore = score;
      matchedText = mention;
    }
  }

  return { score: Number(bestScore.toFixed(3)), matchedText };
}

export async function linkClaimsToEntities(claims: NewsClaim[]): Promise<{
  claims: NewsClaim[];
  links: ClaimLink[];
}> {
  if (!claims.length) return { claims, links: [] };

  const funds = await readFunds();
  if (!funds.length) {
    return {
      claims,
      links: [],
    };
  }

  const targets = buildTargets(funds);
  const links: ClaimLink[] = [];
  const fundIdsByClaim = new Map<string, Set<string>>();

  for (const claim of claims) {
    const mentions = candidateMentions(claim);
    const perClaim = new Map<string, ClaimLink>();

    for (const target of targets) {
      const { score, matchedText } = scoreMatch(target, mentions);
      if (score < 0.76) continue;

      const dedupeKey = `${target.targetType}:${target.targetId}`;
      const existing = perClaim.get(dedupeKey);
      if (existing && existing.score >= score) continue;

      const link: ClaimLink = {
        id: createId("fg-link"),
        claimId: claim.id,
        targetType: target.targetType,
        targetId: target.targetId,
        targetName: target.targetName,
        score,
        matchedText,
        createdAt: new Date().toISOString(),
      };
      perClaim.set(dedupeKey, link);

      if (target.targetType === "FUND" || target.targetType === "COMPANY" || target.targetType === "GP") {
        const bucket = fundIdsByClaim.get(claim.id) ?? new Set<string>();
        bucket.add(target.fundId);
        fundIdsByClaim.set(claim.id, bucket);
      }
    }

    links.push(...Array.from(perClaim.values()).sort((a, b) => b.score - a.score).slice(0, 12));
  }

  const enrichedClaims = claims.map((claim) => {
    const linkedFunds = fundIdsByClaim.get(claim.id);
    return {
      ...claim,
      linkedFundIds: linkedFunds ? Array.from(linkedFunds) : claim.linkedFundIds,
    };
  });

  return {
    claims: enrichedClaims,
    links,
  };
}

export function fundContextForLinks(funds: Fund[]): {
  fundById: Map<string, Fund>;
  gpById: Map<string, { id: string; fundId: string; name: string }>;
  companyById: Map<string, { id: string; fundId: string; name: string }>;
} {
  const fundById = new Map<string, Fund>();
  const gpById = new Map<string, { id: string; fundId: string; name: string }>();
  const companyById = new Map<string, { id: string; fundId: string; name: string }>();

  for (const fund of funds) {
    fundById.set(fund.id, fund);

    for (const gp of fundGpRecords(fund)) {
      gpById.set(gp.id, {
        id: gp.id,
        fundId: fund.id,
        name: gp.name,
      });
    }

    for (const company of fundCompanyRecords(fund)) {
      companyById.set(company.id, {
        id: company.id,
        fundId: fund.id,
        name: company.name,
      });
    }
  }

  return {
    fundById,
    gpById,
    companyById,
  };
}
