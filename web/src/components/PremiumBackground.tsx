import React from "react";
import { cn } from "@/lib/cn";

export function PremiumBackground({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-[100dvh] overflow-hidden text-slate-100",
        "bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900",
        "relative",
        className
      )}
    >
      {/* Nebula glows */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 18% 18%, rgba(168,85,247,0.28) 0%, rgba(168,85,247,0) 52%), radial-gradient(circle at 78% 22%, rgba(99,102,241,0.26) 0%, rgba(99,102,241,0) 55%), radial-gradient(circle at 48% 90%, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0) 50%)",
        }}
      />

      {/* Star field (two layers for depth) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "6px 6px",
          backgroundPosition: "2px 1px",
        }}
      />

      {/* Subtle radial glow behind the centered panel */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(circle_at_50%_18%,rgba(99,102,241,0.35),transparent_55%)]"
        )}
      />
      {/* Subtle vignette */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.06) 0%, rgba(2,6,23,0) 55%, rgba(2,6,23,0.55) 100%)",
        }}
      />
      {children}
    </div>
  );
}

