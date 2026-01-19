import React from "react";
import { Switch } from "@/components/profile/Switch";
import { cn } from "@/lib/cn";

export function SourceRow({
  name,
  icon,
  enabled,
  onToggle,
  className,
}: {
  name: string;
  icon?: React.ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl px-3 py-2", className)}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
          {icon ?? name.slice(0, 1).toUpperCase()}
        </div>
        <div className="text-sm font-semibold text-slate-800">{name}</div>
      </div>
      <Switch checked={enabled} onChange={onToggle} />
    </div>
  );
}
