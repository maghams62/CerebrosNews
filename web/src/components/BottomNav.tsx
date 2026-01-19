import React from "react";
import { cn } from "@/lib/cn";

interface NavItem {
  key: string;
  label: string;
  active?: boolean;
  icon: React.ReactNode;
}

const items: NavItem[] = [
  { key: "feed", label: "Feed", active: true, icon: "📰" },
  { key: "discover", label: "Discover", icon: "🔍" },
  { key: "bookmarks", label: "Bookmarks", icon: "🔖" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

export function BottomNav({
  variant = "inFrame",
  className,
}: {
  variant?: "inFrame" | "fixed";
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "bg-white border-t border-slate-200 shadow-md z-30",
        variant === "fixed"
          ? "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] min-w-[360px]"
          : "absolute inset-x-0 bottom-0",
        className
      )}
    >
      <div className="grid grid-cols-4 h-16 text-xs font-medium text-slate-500">
        {items.map((item) => (
          <button
            key={item.key}
            className={cn(
              "flex flex-col items-center justify-center gap-1",
              item.active ? "text-indigo-600" : "text-slate-500"
            )}
            aria-label={item.label}
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
