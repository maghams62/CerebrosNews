"use client";

import { useEffect, useMemo, useState } from "react";
import { FundCard } from "@/components/fundgraph/FundCard";
import { fundGeoList } from "@/lib/fundgraph/fundEntities";
import { Fund } from "@/fundgraph/types";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function FundsExplorerClient({ funds, initialQuery = "" }: { funds: Fund[]; initialQuery?: string }) {
  const [sector, setSector] = useState("All");
  const [stage, setStage] = useState("All");
  const [geo, setGeo] = useState("All");
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const sectorFilters = useMemo(() => ["All", ...uniqueSorted(funds.flatMap((fund) => fund.sectors ?? []))], [funds]);
  const stageFilters = useMemo(() => ["All", ...uniqueSorted(funds.flatMap((fund) => fund.stages ?? []))], [funds]);
  const geoFilters = useMemo(
    () =>
      [
        "All",
        ...uniqueSorted(funds.flatMap((fund) => fundGeoList(fund))),
      ],
    [funds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return funds.filter((fund) => {
      if (sector !== "All" && !(fund.sectors ?? []).some((value) => value === sector)) return false;
      if (stage !== "All" && !(fund.stages ?? []).some((value) => value === stage)) return false;
      const geos = fundGeoList(fund);
      if (geo !== "All" && !geos.includes(geo)) return false;
      if (!q) return true;

      return (
        fund.name.toLowerCase().includes(q) ||
        fund.gp.name.toLowerCase().includes(q) ||
        fund.sectors.some((x) => x.toLowerCase().includes(q)) ||
        fund.portfolio.some((x) => x.toLowerCase().includes(q)) ||
        geos.some((x) => x.toLowerCase().includes(q))
      );
    });
  }, [funds, sector, stage, geo, query]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h1 className="text-xl font-semibold text-slate-900">Funds</h1>
        <p className="mt-1 text-sm text-slate-600">Browse by sector, stage, and geography.</p>

        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search funds, GPs, sectors, or portfolio companies"
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400"
          />
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {sectorFilters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {stageFilters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={geo} onChange={(e) => setGeo(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {geoFilters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((fund) => (
          <FundCard key={fund.id} fund={fund} />
        ))}
      </section>

      {!filtered.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
          No funds match these filters.
        </div>
      ) : null}
    </div>
  );
}
