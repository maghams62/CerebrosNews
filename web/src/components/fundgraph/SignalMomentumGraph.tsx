"use client";

import Link from "next/link";
import { SignalMomentumTheme } from "@/components/fundgraph/forYouTypes";
import { SectionHelpTooltip } from "@/components/fundgraph/SectionHelpTooltip";

const LINE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

function deltaTone(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-500";
}

function buildLinePath(values: number[], maxValue: number, width: number, height: number): string {
  if (!values.length) return "";
  const padX = 14;
  const padY = 10;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0;
  const scale = maxValue > 0 ? usableHeight / maxValue : 0;
  return values
    .map((value, idx) => {
      const x = padX + step * idx;
      const y = padY + usableHeight - value * scale;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function SignalMomentumGraph({ items, windowLabel }: { items: SignalMomentumTheme[]; windowLabel: string }) {
  const maxValue = Math.max(1, ...items.flatMap((item) => item.samples.map((sample) => sample.value)));
  const axisLabels = items[0]?.samples.map((sample) => sample.label) ?? [];
  const axisAnchors =
    axisLabels.length >= 3
      ? [
          { idx: 0, label: axisLabels[0] },
          { idx: Math.floor((axisLabels.length - 1) / 2), label: axisLabels[Math.floor((axisLabels.length - 1) / 2)] },
          { idx: axisLabels.length - 1, label: axisLabels[axisLabels.length - 1] },
        ]
      : axisLabels.map((label, idx) => ({ idx, label }));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Market Movement</div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Signal momentum ({windowLabel})</h2>
            <SectionHelpTooltip text="Shows which themes are heating up or cooling down so you can spot movement fast." />
          </div>
          <p className="mt-1 text-sm text-slate-600">What themes are accelerating or cooling off.</p>
        </div>
        <Link
          href="/cerebrosfund/signals"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View theme signals
        </Link>
      </div>

      {items.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <svg viewBox="0 0 440 180" className="h-44 w-full">
              {[0, 1, 2, 3].map((row) => {
                const y = 12 + row * 52;
                return <line key={row} x1="14" y1={y} x2="426" y2={y} stroke="#e2e8f0" strokeWidth="1" />;
              })}
              {items.map((item, idx) => (
                <path
                  key={item.slug}
                  d={buildLinePath(
                    item.samples.map((sample) => sample.value),
                    maxValue,
                    440,
                    180
                  )}
                  fill="none"
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ))}
            </svg>
            <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
              {axisAnchors.map((anchor) => (
                <span key={`${anchor.idx}-${anchor.label}`}>{anchor.label}</span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <Link
                key={item.slug}
                href={item.href}
                className="flex items-start justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.theme}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{item.signalCount} signals</p>
                </div>
                <div className={`shrink-0 text-sm font-semibold ${deltaTone(item.trendDelta)}`}>
                  {item.trendDelta >= 0 ? "↑ +" : "↓ "}
                  {item.trendDelta}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-sm text-slate-500">
          Not enough recent signals to compute momentum yet.
        </div>
      )}
    </section>
  );
}
