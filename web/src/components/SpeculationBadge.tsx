import { SpeculationStatus } from "@/types/insights";

const colorMap: Record<SpeculationStatus, string> = {
  Confirmed: "bg-emerald-100 text-emerald-700",
  Developing: "bg-amber-100 text-amber-800",
  Speculative: "bg-rose-100 text-rose-700",
};

export function SpeculationBadge({ status }: { status: SpeculationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[status]}`}>
      {status}
    </span>
  );
}

