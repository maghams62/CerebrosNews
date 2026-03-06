"use client";

import Link from "next/link";
import { FundGP } from "@/fundgraph/types";
import { initialsFromName } from "@/components/fundgraph/fundProfileUtils";

export function FundGPCard({ gp }: { gp: FundGP }) {
  const initials = initialsFromName(gp.name);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <h2 className="text-sm font-semibold text-slate-900">General Partner</h2>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-xl font-semibold text-slate-700">
          {gp.photoUrl ? (
            <div
              role="img"
              aria-label={`${gp.name} photo`}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url('${gp.photoUrl}')` }}
            />
          ) : (
            initials
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-slate-900">{gp.name}</p>
          <p className="text-sm text-slate-600">{gp.title}</p>

          {gp.previousFirms?.length ? (
            <p className="mt-1 text-sm text-slate-600">ex-{gp.previousFirms.join(", ")}</p>
          ) : null}

          {gp.linkedinUrl ? (
            <Link href={gp.linkedinUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800">
              LinkedIn profile
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-600">{gp.bio}</p>

      {gp.focusAreas?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Focus Areas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {gp.focusAreas.map((area) => (
              <span key={area} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {area}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {gp.partnerNetwork?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Partner Network</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {gp.partnerNetwork.map((company) => (
              <span key={company} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {company}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
