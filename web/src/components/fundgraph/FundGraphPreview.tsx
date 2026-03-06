"use client";

import Link from "next/link";

type Point = {
  x: number;
  y: number;
  label: string;
  type: "fund" | "company" | "coInvestor" | "founder";
};

function nodeStyle(type: Point["type"]): { fill: string; stroke: string } {
  if (type === "fund") return { fill: "#0f172a", stroke: "#0f172a" };
  if (type === "company") return { fill: "#dcfce7", stroke: "#22c55e" };
  if (type === "coInvestor") return { fill: "#dbeafe", stroke: "#2563eb" };
  return { fill: "#ede9fe", stroke: "#7c3aed" };
}

export function FundGraphPreview({
  fundId,
  fundName,
  companies,
  coInvestors,
  founders,
}: {
  fundId: string;
  fundName: string;
  companies: string[];
  coInvestors: string[];
  founders: string[];
}) {
  const center = { x: 190, y: 120 };
  const points: Point[] = [
    { x: center.x, y: center.y, label: fundName, type: "fund" },
    ...companies.slice(0, 3).map((company, idx) => ({ x: 55, y: 50 + idx * 70, label: company, type: "company" as const })),
    ...coInvestors.slice(0, 2).map((coInvestor, idx) => ({ x: 325, y: 65 + idx * 70, label: coInvestor, type: "coInvestor" as const })),
    ...founders.slice(0, 2).map((founder, idx) => ({ x: 325, y: 140 + idx * 70, label: founder, type: "founder" as const })),
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Network Graph</h2>
          <p className="mt-1 text-sm text-slate-600">Fund links across companies, co-investors, and founders.</p>
        </div>
        <Link
          href={`/cerebrosfund/graph?fundId=${encodeURIComponent(fundId)}`}
          className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Expand Graph
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox="0 0 380 240" className="h-[240px] min-w-[360px] w-full rounded-xl border border-slate-200 bg-slate-50">
          {points.slice(1).map((point, idx) => (
            <line key={`line-${idx}-${point.label}`} x1={center.x} y1={center.y} x2={point.x} y2={point.y} stroke="#94a3b8" strokeWidth="1.5" />
          ))}

          {points.map((point, idx) => {
            const style = nodeStyle(point.type);
            const isFund = point.type === "fund";
            const label = point.label.length > 24 ? `${point.label.slice(0, 23)}...` : point.label;

            return (
              <g key={`${idx}-${point.label}`}>
                <circle cx={point.x} cy={point.y} r={isFund ? 18 : 14} fill={style.fill} stroke={style.stroke} strokeWidth="2" />
                <text
                  x={point.x + (point.x < center.x ? -8 : 18)}
                  y={point.y + 4}
                  textAnchor={point.x < center.x ? "end" : "start"}
                  className="fill-slate-700 text-[10px] font-semibold"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Companies</div>
          <div className="mt-1 text-xs text-slate-700">{companies.slice(0, 3).join(", ")}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Co-investors</div>
          <div className="mt-1 text-xs text-slate-700">{coInvestors.slice(0, 3).join(", ")}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Founders</div>
          <div className="mt-1 text-xs text-slate-700">{founders.slice(0, 3).join(", ")}</div>
        </div>
      </div>
    </section>
  );
}
