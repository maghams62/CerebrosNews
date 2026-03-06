import Link from "next/link";
import { NarrativeTrendItem } from "@/components/fundgraph/forYouTypes";

function directionBadge(item: NarrativeTrendItem): string {
  const sign = item.delta >= 0 ? "+" : "";
  const arrow = item.direction === "up" ? "↑" : "↓";
  return `${arrow} ${sign}${item.delta}`;
}

function directionClass(direction: NarrativeTrendItem["direction"]): string {
  return direction === "up" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
}

export function NarrativeTrendCards({ narratives }: { narratives: NarrativeTrendItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Market Narratives</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Emerging themes</h2>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {narratives.map((item) => (
          <Link
            key={item.slug}
            href={item.href}
            className="group rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${directionClass(item.direction)}`}>
                {directionBadge(item)}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-slate-600">{item.summary}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">{item.supportCount} supporting signals</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
