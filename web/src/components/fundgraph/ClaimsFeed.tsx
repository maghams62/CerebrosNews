"use client";

import { useMemo, useState } from "react";
import { ClaimCard } from "@/components/fundgraph/ClaimCard";
import { UnlockBanner } from "@/components/fundgraph/UnlockBanner";
import { useFundGraphState } from "@/fundgraph/state";
import { NewsClaim } from "@/fundgraph/types";
import { getNextTierThreshold } from "@/lib/fundgraph/gamification.shared";

type CategoryFilter = "All" | NewsClaim["category"];

export function ClaimsFeed({
  claims,
  defaultSourceId,
}: {
  claims: NewsClaim[];
  defaultSourceId?: string;
}) {
  const { limits, contributions, tier } = useFundGraphState();
  const categories = useMemo<CategoryFilter[]>(
    () => ["All", ...Array.from(new Set(claims.map((claim) => claim.category))).sort((left, right) => left.localeCompare(right))],
    [claims]
  );
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((claim) => {
      if (defaultSourceId && claim.sourceId !== defaultSourceId) return false;
      if (category !== "All" && claim.category !== category) return false;
      if (!q) return true;
      return (
        claim.claimText.toLowerCase().includes(q) ||
        claim.entities.some((entity) => entity.toLowerCase().includes(q)) ||
        claim.citation.title.toLowerCase().includes(q)
      );
    });
  }, [claims, category, query, defaultSourceId]);
  const visible = filtered.slice(0, limits.maxClaimsVisible);
  const lockedCount = Math.max(0, filtered.length - visible.length);
  const nextThreshold = getNextTierThreshold(tier);
  const needed = nextThreshold ? Math.max(0, nextThreshold - contributions) : 0;

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item as CategoryFilter)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                category === item
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search claims"
            className="ml-auto h-9 w-full max-w-xs rounded-full border border-slate-200 bg-slate-50 px-4 text-xs text-slate-900 outline-none focus:border-slate-400"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-6">
        {visible.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
        {lockedCount > 0 ? (
          <UnlockBanner
            title={`You've unlocked ${visible.length} of ${filtered.length} claims.`}
            detail={needed > 0 ? `Unlock more by contributing. ${needed} more contributions to reach the next tier.` : "Unlock more by contributing."}
          />
        ) : null}
        {!filtered.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
            No claims match this filter yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
