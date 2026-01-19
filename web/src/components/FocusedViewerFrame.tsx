import React from "react";
import { cn } from "@/lib/cn";
import { PremiumBackground } from "@/components/PremiumBackground";
import { FocusedPanel } from "@/components/FocusedPanel";

export function FocusedViewerFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <PremiumBackground>
      <div className="h-full w-full flex items-center justify-center px-3 py-3 md:px-4 md:py-4">
        <FocusedPanel
          className={cn(
            "w-[min(1200px,92vw)] md:w-[min(1200px,90vw)]",
            "h-[min(900px,92vh)] md:h-[min(900px,90vh)]",
            className
          )}
        >
          {children}
        </FocusedPanel>
      </div>
    </PremiumBackground>
  );
}

