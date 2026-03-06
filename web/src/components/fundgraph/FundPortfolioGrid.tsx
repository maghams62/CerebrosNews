"use client";

import Link from "next/link";
import { FundPortfolioMetrics } from "@/fundgraph/types";
import { companyBadgeStyle } from "@/components/fundgraph/fundProfileUtils";
import { getPortfolioCompanyProfile } from "@/lib/fundgraph/fundEntityProfiles";

export function FundPortfolioGrid({
  companies,
  metrics,
}: {
  companies: string[];
  metrics: FundPortfolioMetrics;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <h2 className="text-sm font-semibold text-slate-900">Portfolio</h2>
      <p className="mt-1 text-sm text-slate-600">Real company mix and execution metrics.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {companies.map((company) => {
          const style = companyBadgeStyle(company);
          const profile = getPortfolioCompanyProfile(company);
          const hasUrl = Boolean(profile?.url);
          const title = profile?.founders?.length
            ? `${profile.canonicalName} founders: ${profile.founders.slice(0, 3).join(", ")}`
            : profile?.canonicalName ?? company;
          return (
            <div key={company} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: style.tint, color: style.accent }}
              >
                {style.token}
              </span>
              {hasUrl ? (
                <Link
                  href={profile?.url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-blue-700 hover:text-blue-800"
                  title={title}
                >
                  {profile?.canonicalName ?? company}
                </Link>
              ) : (
                <span className="truncate text-sm font-medium text-slate-800" title={title}>
                  {profile?.canonicalName ?? company}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Portfolio Size: <span className="font-semibold text-slate-900">{metrics.portfolioSize}</span>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Lead Rate: <span className="font-semibold text-slate-900">{metrics.leadInvestmentRate}%</span>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Follow-on Rate: <span className="font-semibold text-slate-900">{metrics.followOnRate}%</span>
        </div>
      </div>

      {metrics.topExits?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Top Exits</span>
          {metrics.topExits.map((exit) => (
            <span key={exit} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {exit}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
