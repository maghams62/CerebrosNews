import React from "react";
import { EvidenceStrength } from "@/types/insights";
import { cn } from "@/lib/cn";

export function EvidenceStrengthMeter({ strength }: { strength: EvidenceStrength }) {
  const filled =
    strength === "Strong" ? 3 : strength === "Medium" ? 2 : 1;

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-semibold text-slate-800">Evidence</div>
      <div className="flex items-center gap-1" aria-label={`Evidence strength: ${strength}`}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-2.5 w-7 rounded-full",
              i <= filled ? "bg-indigo-600" : "bg-slate-200"
            )}
          />
        ))}
      </div>
      <div className="text-xs font-semibold text-slate-500">{strength}</div>
    </div>
  );
}

