import React from "react";
import { cn } from "@/lib/cn";

export function FocusedPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-[min(900px,95vw)] md:w-[min(900px,75vw)]",
        "h-[min(820px,92vh)] md:h-[min(820px,80vh)]",
        "rounded-[28px] bg-white overflow-hidden",
        "shadow-[0_30px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10",
        className
      )}
    >
      {children}
    </div>
  );
}

