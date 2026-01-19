import React from "react";
import { cn } from "@/lib/cn";

export function Chip({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700",
        className
      )}
    >
      <span>{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="text-slate-400 hover:text-slate-600"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
