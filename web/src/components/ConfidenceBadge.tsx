import { ClaimConfidence } from "@/types/insights";

const map: Record<ClaimConfidence, string> = {
  High: "bg-emerald-100 text-emerald-700",
  Med: "bg-amber-100 text-amber-800",
  Low: "bg-rose-100 text-rose-700",
};

export function ConfidenceBadge({ confidence }: { confidence: ClaimConfidence }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[confidence]}`}>{confidence}</span>;
}

