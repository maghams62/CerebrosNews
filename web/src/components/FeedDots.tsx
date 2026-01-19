import React from "react";
import { cn } from "@/lib/cn";

export function FeedDots({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all",
            i === activeIndex ? "h-3 w-3 bg-slate-900/80" : "h-2 w-2 bg-slate-300/80"
          )}
          aria-hidden
        />
      ))}
    </div>
  );
}

