import { BiasLabel } from "@/types/insights";

const colorMap: Record<BiasLabel, string> = {
  Left: "bg-rose-100 text-rose-700",
  Center: "bg-emerald-100 text-emerald-700",
  Right: "bg-blue-100 text-blue-700",
  Mixed: "bg-amber-100 text-amber-700",
};

export function BiasBadge({ label }: { label: BiasLabel }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[label]}`}>
      {label}
    </span>
  );
}
