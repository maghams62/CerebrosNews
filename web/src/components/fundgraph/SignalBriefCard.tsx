"use client";

import { useMemo, useState } from "react";
import { SignalReportDrawer } from "@/components/fundgraph/SignalReportDrawer";
import { SignalBriefItem } from "@/components/fundgraph/forYouTypes";

function confidenceTone(level: SignalBriefItem["confidence"]): string {
  if (level === "High") return "bg-emerald-100 text-emerald-700";
  if (level === "Medium") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function deltaTone(direction: SignalBriefItem["direction"]): string {
  return direction === "up" ? "text-emerald-600" : "text-rose-600";
}

export function SignalBriefCard({
  item,
}: {
  item: SignalBriefItem;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const deltaText = useMemo(() => {
    const sign = item.delta >= 0 ? "+" : "";
    const arrow = item.direction === "up" ? "↑" : "↓";
    return `${arrow} ${sign}${item.delta}`;
  }, [item.delta, item.direction]);

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={() => setReportOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setReportOpen(true);
          }
        }}
        className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-150 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">#{item.rank} Signal</div>
            <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</h3>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${confidenceTone(item.confidence)}`}>
            {item.confidence}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.chips.slice(0, 4).map((chip) => (
            <span key={`${item.id}-chip-${chip}`} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {chip}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900">{item.strengthScore}</span>
          <span className={`font-semibold ${deltaTone(item.direction)}`}>{deltaText}</span>
        </div>

        <p className="mt-2 line-clamp-1 text-xs text-slate-600">
          Why you&apos;re seeing this: <span className="font-medium">{item.why}</span>
        </p>
        <p className="mt-2 text-[11px] font-semibold text-slate-600">Click to open signal details</p>
      </article>

      <SignalReportDrawer
        open={reportOpen}
        signal={item.signal}
        fundName={item.fund.name}
        closeLabel="Back to brief"
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}
