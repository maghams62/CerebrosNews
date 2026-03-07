import { Fund } from "@/lib/fundgraph/types";

export interface ClaimLike {
  id: string;
  claimText: string;
  entities?: string[];
}

export interface ClaimFundLink {
  claimId: string;
  fundId: string;
  matchType: "portfolio" | "gp" | "fund";
  matchedEntity: string;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function linkClaimsToFunds(claims: ClaimLike[], funds: Fund[]): ClaimFundLink[] {
  const links: ClaimFundLink[] = [];

  for (const claim of claims) {
    const claimText = normalize(claim.claimText);
    const entities = (claim.entities ?? []).map((e) => normalize(e)).filter(Boolean);
    const haystack = new Set([claimText, ...entities]);

    for (const fund of funds) {
      const fundName = normalize(fund.name);
      if (Array.from(haystack).some((text) => text.includes(fundName))) {
        links.push({ claimId: claim.id, fundId: fund.id, matchType: "fund", matchedEntity: fund.name });
        continue;
      }

      const gpHit = fund.gpNames.find((gpName) => {
        const name = normalize(gpName);
        return Array.from(haystack).some((text) => text.includes(name));
      });
      if (gpHit) {
        links.push({ claimId: claim.id, fundId: fund.id, matchType: "gp", matchedEntity: gpHit });
        continue;
      }

      const companyHit = fund.portfolio.find((company) => {
        const name = normalize(company);
        return Array.from(haystack).some((text) => text.includes(name));
      });
      if (companyHit) {
        links.push({ claimId: claim.id, fundId: fund.id, matchType: "portfolio", matchedEntity: companyHit });
      }
    }
  }

  return links;
}
