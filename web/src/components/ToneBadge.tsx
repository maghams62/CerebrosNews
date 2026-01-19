import { Tone } from "@/types/insights";

const map: Record<Tone, string> = {
  Optimistic: "bg-emerald-100 text-emerald-700",
  Skeptical: "bg-rose-100 text-rose-700",
  Neutral: "bg-slate-100 text-slate-700",
};

export function ToneBadge({ tone }: { tone: Tone }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[tone]}`}>{tone}</span>;
}

