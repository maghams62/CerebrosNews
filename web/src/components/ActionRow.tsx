import React from "react";
import { cn } from "@/lib/cn";

export function ActionRow({
  onPerspectives,
  onTrust,
  onAsk,
  onSave,
  saved,
}: {
  onPerspectives: () => void;
  onTrust: () => void;
  onAsk: () => void;
  onSave: () => void;
  saved: boolean;
}) {
  const btn =
    "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button className={btn} onClick={onPerspectives} aria-label="Compare">
          <span aria-hidden>🔁</span>
          <span>Compare</span>
        </button>
        <button className={btn} onClick={onTrust} aria-label="Why am I seeing this">
          <span aria-hidden>🧭</span>
          <span>Why am I seeing this</span>
        </button>
        <button className={btn} onClick={onAsk} aria-label="Aks Cerebros">
          <span aria-hidden>💬</span>
          <span>Aks Cerebros</span>
        </button>
      </div>
      <button
        className={cn(btn, saved ? "text-indigo-700" : "")}
        onClick={onSave}
        aria-label="Save"
      >
        <span aria-hidden>🔖</span>
        <span>{saved ? "Saved" : "Save"}</span>
      </button>
    </div>
  );
}

