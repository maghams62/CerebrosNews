import Link from "next/link";
import { ConfidenceShiftItem } from "@/components/fundgraph/forYouTypes";

function confidenceTone(label: ConfidenceShiftItem["confidence"]): string {
  if (label === "High") return "text-emerald-700";
  if (label === "Medium") return "text-amber-700";
  return "text-rose-700";
}

function ShiftColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "up" | "down";
  items: ConfidenceShiftItem[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block rounded-lg border border-transparent bg-white px-3 py-2 text-xs transition hover:border-slate-200"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 font-semibold text-slate-800">{item.title}</p>
              <span className={`shrink-0 font-semibold ${tone === "up" ? "text-emerald-700" : "text-rose-700"}`}>
                {tone === "up" ? "↑" : "↓"} {item.delta >= 0 ? "+" : ""}
                {item.delta}
              </span>
            </div>
            <p className={`mt-1 text-[11px] font-semibold ${confidenceTone(item.confidence)}`}>{item.confidence} confidence</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ConfidenceShiftList({
  increases,
  decreases,
}: {
  increases: ConfidenceShiftItem[];
  decreases: ConfidenceShiftItem[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Confidence Shifts</div>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">What became stronger vs contested</h2>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ShiftColumn title="Confidence ↑" tone="up" items={increases} />
        <ShiftColumn title="Confidence ↓" tone="down" items={decreases} />
      </div>
    </section>
  );
}
