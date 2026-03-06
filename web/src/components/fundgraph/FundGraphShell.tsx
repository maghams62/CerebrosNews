"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { AddIntelligenceModal } from "@/components/fundgraph/AddIntelligenceModal";
import { DemoResetCreditsButton } from "@/components/fundgraph/DemoResetCreditsButton";
import { FundGraphUnlockBadge } from "@/components/fundgraph/FundGraphUnlockBadge";
import { useFundGraphState } from "@/fundgraph/state";
import { FundGraphDataMode } from "@/fundgraph/types";

type Tab = {
  href: string;
  label: string;
};

const TABS: Tab[] = [
  { href: "/cerebrosfund", label: "For You" },
  { href: "/cerebrosfund/funds", label: "Funds" },
  { href: "/cerebrosfund/shortlist", label: "Shortlist" },
  { href: "/cerebrosfund/signals", label: "Signals" },
  { href: "/cerebrosfund/graph", label: "Graph Analyzer" },
  { href: "/cerebrosfund/profile", label: "My Profile" },
];

export function FundGraphShell({
  mode,
  fundOptions,
  children,
}: {
  mode: FundGraphDataMode;
  fundOptions: Array<{ id: string; name: string }>;
  children: React.ReactNode;
}) {
  const { cred } = useFundGraphState();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const activeTab = useMemo(
    () =>
      TABS.find((tab) => (tab.href === "/cerebrosfund" ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`)))
        ?.href ?? "/cerebrosfund",
    [pathname]
  );

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const value = search.trim();
    if (!value) {
      router.push("/cerebrosfund/funds");
      return;
    }
    router.push(`/cerebrosfund/funds?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="flex h-full flex-col bg-[#f5f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/cerebrosfund" className="text-xl font-semibold tracking-tight text-slate-900">
              CerebrosFund
            </Link>
            <nav className="hidden items-center gap-1 rounded-full bg-slate-100 p-1 md:flex">
              {TABS.map((tab) => {
                const active = activeTab === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500 uppercase">
              {mode}
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <form onSubmit={runSearch} className="w-full max-w-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search funds, companies, claims, sources"
                className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </form>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="h-9 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Publish New Signal
            </button>
            <div className="inline-flex h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
              Tokens: {cred}
            </div>
            <DemoResetCreditsButton />
            <FundGraphUnlockBadge onAddSignal={() => setModalOpen(true)} />
          </div>
        </div>

        <div className="mt-3 md:hidden">
          <div>
            <nav className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {TABS.map((tab) => {
                const active = activeTab === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                      active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">{children}</main>

      <AddIntelligenceModal open={modalOpen} onClose={() => setModalOpen(false)} funds={fundOptions} />
    </div>
  );
}
