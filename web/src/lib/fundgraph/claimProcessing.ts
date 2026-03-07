import { extractClaimsForSource } from "@/lib/fundgraph/claims";
import { linkClaimsToEntities } from "@/lib/fundgraph/entityLinking";
import { replaceClaimLinksForClaims, replaceClaimsForSource } from "@/lib/fundgraph/store";
import { ClaimLink, NewsClaim, NewsSource } from "@/lib/fundgraph/types";

export async function extractAndStoreClaimsFromSource(source: NewsSource): Promise<{
  claims: NewsClaim[];
  links: ClaimLink[];
}> {
  const extracted = await extractClaimsForSource(source);
  const linked = await linkClaimsToEntities(extracted);
  const storedClaims = await replaceClaimsForSource(source.id, linked.claims);
  await replaceClaimLinksForClaims(
    storedClaims.map((claim) => claim.id),
    linked.links
  );
  return { claims: storedClaims, links: linked.links };
}
