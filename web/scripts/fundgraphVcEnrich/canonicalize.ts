import { ClaimLink, Fund, GraphEdge, NewsClaim, Signal, Source } from "@/lib/fundgraph/types";
import { CanonicalizationResult } from "./types";
import { chooseRicherString, firstNonEmpty, normalizeName, numericSuffix, slugify, uniqStrings } from "./utils";

type CanonicalizationExtended = CanonicalizationResult & {
  duplicateGroups: number;
};

function pickCanonicalId(group: Fund[]): string {
  const sorted = [...group].sort((left, right) => {
    const suffixDelta = numericSuffix(left.id) - numericSuffix(right.id);
    if (suffixDelta !== 0) return suffixDelta;
    return left.id.localeCompare(right.id);
  });
  return sorted[0]?.id ?? group[0]?.id ?? "fg-fund-unknown";
}

function mergeGp(group: Fund[], mergedGpNames: string[]): Fund["gp"] {
  const gpObjects = group.map((fund) => fund.gp).filter((gp): gp is NonNullable<Fund["gp"]> => Boolean(gp));
  const primary = gpObjects[0] ?? {
    name: mergedGpNames[0] ?? "General Partner",
    title: "General Partner",
    bio: "Partner biography sourced from public fund pages and coverage.",
  };

  const previousFirms = uniqStrings(gpObjects.flatMap((gp) => gp.previousFirms ?? []), 20);
  const focusAreas = uniqStrings(gpObjects.flatMap((gp) => gp.focusAreas ?? []), 20);
  const partnerNetwork = uniqStrings(gpObjects.flatMap((gp) => gp.partnerNetwork ?? []), 30);

  return {
    ...primary,
    name: mergedGpNames[0] ?? primary.name,
    title: chooseRicherString(gpObjects.map((gp) => gp.title), primary.title),
    bio: chooseRicherString(gpObjects.map((gp) => gp.bio), primary.bio),
    previousFirms: previousFirms.length ? previousFirms : undefined,
    focusAreas: focusAreas.length ? focusAreas : undefined,
    partnerNetwork: partnerNetwork.length ? partnerNetwork : undefined,
    linkedinUrl: firstNonEmpty(gpObjects.map((gp) => gp.linkedinUrl), primary.linkedinUrl),
    photoUrl: firstNonEmpty(gpObjects.map((gp) => gp.photoUrl), primary.photoUrl),
  };
}

function mergeFundGroup(group: Fund[], canonicalId: string): Fund {
  const canonicalFirst = [...group].sort((left, right) => left.id.localeCompare(right.id))[0] ?? group[0];
  const gpNames = uniqStrings(
    group
      .flatMap((fund) => [...(fund.gpNames ?? []), fund.gp?.name ?? ""])
      .filter(Boolean),
    30
  );
  const mergedGp = mergeGp(group, gpNames);
  const description = chooseRicherString(group.map((fund) => fund.description), canonicalFirst.description);
  const strategy = chooseRicherString(group.map((fund) => fund.strategy), canonicalFirst.strategy);
  const aliases = uniqStrings(
    group.flatMap((fund) => [fund.name, ...(fund.aliases ?? []), fund.slug]),
    60
  ).filter((alias) => normalizeName(alias) !== normalizeName(canonicalFirst.name));

  const geography = uniqStrings(group.flatMap((fund) => fund.geography ?? []), 20);
  const geographies = uniqStrings(group.flatMap((fund) => fund.geographies ?? []), 20);
  const stages = uniqStrings(group.flatMap((fund) => (fund.stages ?? []).map((stage) => String(stage))), 10) as Fund["stages"];
  const sectors = uniqStrings(group.flatMap((fund) => (fund.sectors ?? []).map((sector) => String(sector))), 20) as Fund["sectors"];
  const checkSizeMinCandidates = group.map((fund) => fund.checkSizeMinM).filter((value) => Number.isFinite(value) && value > 0);
  const checkSizeMaxCandidates = group.map((fund) => fund.checkSizeMaxM).filter((value) => Number.isFinite(value) && value > 0);
  const checkSizeMinM = checkSizeMinCandidates.length ? Math.min(...checkSizeMinCandidates) : canonicalFirst.checkSizeMinM;
  const checkSizeMaxM = checkSizeMaxCandidates.length
    ? Math.max(...checkSizeMaxCandidates)
    : Math.max(checkSizeMinM, canonicalFirst.checkSizeMaxM);

  const vintageCandidates = group.map((fund) => fund.vintageYear).filter((value) => Number.isFinite(value) && value > 0);
  const vintageYear = vintageCandidates.length ? Math.min(...vintageCandidates) : canonicalFirst.vintageYear;
  const aumCandidates = group.map((fund) => fund.aumM).filter((value) => Number.isFinite(value) && value > 0);
  const aumM = aumCandidates.length ? Math.max(...aumCandidates) : canonicalFirst.aumM;
  const trendScore = Math.max(...group.map((fund) => fund.trendScore ?? 0));
  const momentumScore = Math.max(...group.map((fund) => fund.momentumScore ?? 0));
  const communityScore = Math.max(...group.map((fund) => fund.communityScore ?? 0));

  const officialUrl = firstNonEmpty(group.map((fund) => fund.officialUrl), undefined);
  const entityType = group.some((fund) => fund.entityType === "FUND_VEHICLE") ? "FUND_VEHICLE" : "VC_FIRM";

  return {
    ...canonicalFirst,
    id: canonicalId,
    slug: canonicalFirst.slug || slugify(canonicalFirst.name),
    name: canonicalFirst.name,
    aliases: aliases.length ? aliases : undefined,
    officialUrl,
    entityType,
    description,
    strategy,
    geography: geography.length ? geography : canonicalFirst.geography,
    geographies: geographies.length ? geographies : canonicalFirst.geographies,
    stages: stages.length ? stages : canonicalFirst.stages,
    sectors: sectors.length ? sectors : canonicalFirst.sectors,
    checkSizeMinM,
    checkSizeMaxM,
    checkSizeKUsd: {
      min: Math.max(10, Math.round(checkSizeMinM * 1000)),
      max: Math.max(10, Math.round(checkSizeMaxM * 1000)),
    },
    aumM,
    vintageYear,
    trendScore,
    momentumScore,
    communityScore,
    gp: mergedGp,
    gpNames: gpNames.length ? gpNames : canonicalFirst.gpNames,
    portfolio: uniqStrings(group.flatMap((fund) => fund.portfolio ?? []), 200),
    coInvestors: uniqStrings(group.flatMap((fund) => fund.coInvestors ?? []), 120),
    founders: uniqStrings(group.flatMap((fund) => fund.founders ?? []), 120),
    stageFocus: uniqStrings(group.flatMap((fund) => fund.stageFocus ?? []), 12),
    sectorFocus: uniqStrings(group.flatMap((fund) => fund.sectorFocus ?? []), 20),
    geoFocus: uniqStrings(group.flatMap((fund) => fund.geoFocus ?? []), 20),
    dataOrigin: canonicalFirst.dataOrigin ?? "curated",
  };
}

export function canonicalizeFunds(funds: Fund[]): CanonicalizationExtended {
  const groups = new Map<string, Fund[]>();
  for (const fund of funds) {
    const key = normalizeName(fund.name);
    const bucket = groups.get(key) ?? [];
    bucket.push(fund);
    groups.set(key, bucket);
  }

  const aliasByFundId = new Map<string, string>();
  const mergedFunds: Fund[] = [];
  let mergedFundCount = 0;
  let duplicateGroups = 0;

  const sortedGroups = [...groups.values()].sort((left, right) => {
    const nameLeft = left[0]?.name ?? "";
    const nameRight = right[0]?.name ?? "";
    return nameLeft.localeCompare(nameRight);
  });

  for (const group of sortedGroups) {
    const canonicalId = pickCanonicalId(group);
    const merged = mergeFundGroup(group, canonicalId);
    mergedFunds.push(merged);
    if (group.length > 1) {
      duplicateGroups += 1;
      mergedFundCount += group.length - 1;
    }
    for (const member of group) {
      aliasByFundId.set(member.id, canonicalId);
    }
  }

  return {
    funds: mergedFunds,
    aliasByFundId,
    mergedFundCount,
    duplicateGroups,
  };
}

function remapFundScopedEntityId(entityId: string, aliasByFundId: Map<string, string>): string {
  for (const [oldFundId, canonicalFundId] of aliasByFundId.entries()) {
    if (entityId === oldFundId) return canonicalFundId;
    if (entityId.startsWith(`${oldFundId}_`)) {
      return `${canonicalFundId}${entityId.slice(oldFundId.length)}`;
    }
  }
  return entityId;
}

export function remapSignalFundIds(signals: Signal[], aliasByFundId: Map<string, string>): Signal[] {
  return signals.map((signal) => {
    const mapped = aliasByFundId.get(signal.fundId) ?? signal.fundId;
    if (mapped === signal.fundId) return signal;
    return {
      ...signal,
      fundId: mapped,
    };
  });
}

export function remapGraphEdges(edges: GraphEdge[], aliasByFundId: Map<string, string>): GraphEdge[] {
  return edges.map((edge) => {
    let fromId = edge.fromId;
    let toId = edge.toId;
    if (edge.fromType === "fund") {
      fromId = aliasByFundId.get(edge.fromId) ?? edge.fromId;
    } else {
      fromId = remapFundScopedEntityId(edge.fromId, aliasByFundId);
    }
    if (edge.toType === "fund") {
      toId = aliasByFundId.get(edge.toId) ?? edge.toId;
    } else {
      toId = remapFundScopedEntityId(edge.toId, aliasByFundId);
    }
    if (fromId === edge.fromId && toId === edge.toId) return edge;
    return {
      ...edge,
      fromId,
      toId,
    };
  });
}

export function remapClaims(claims: NewsClaim[], aliasByFundId: Map<string, string>): NewsClaim[] {
  return claims.map((claim) => {
    const remapped = uniqStrings((claim.linkedFundIds ?? []).map((fundId) => aliasByFundId.get(fundId) ?? fundId));
    return {
      ...claim,
      linkedFundIds: remapped,
    };
  });
}

export function remapClaimLinks(links: ClaimLink[], aliasByFundId: Map<string, string>): ClaimLink[] {
  return links.map((link) => {
    if (link.targetType === "FUND") {
      const targetId = aliasByFundId.get(link.targetId) ?? link.targetId;
      if (targetId === link.targetId) return link;
      return {
        ...link,
        targetId,
      };
    }
    const targetId = remapFundScopedEntityId(link.targetId, aliasByFundId);
    if (targetId === link.targetId) return link;
    return {
      ...link,
      targetId,
    };
  });
}

export function remapSourceFundMetadata(sources: Source[], aliasByFundId: Map<string, string>): Source[] {
  return sources.map((source) => {
    const matchedFundIds = Array.isArray(source.metadata?.matchedFundIds)
      ? uniqStrings(
          source.metadata?.matchedFundIds
            .map((value) => String(value))
            .map((fundId) => aliasByFundId.get(fundId) ?? fundId)
        )
      : [];
    if (!matchedFundIds.length) return source;
    return {
      ...source,
      metadata: {
        ...(source.metadata ?? {}),
        matchedFundIds,
      },
    };
  });
}

