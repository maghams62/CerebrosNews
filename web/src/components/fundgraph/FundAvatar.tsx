"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

export function FundAvatar({
  name,
  imageUrl,
  className = "h-11 w-11",
}: {
  name: string;
  imageUrl?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initials = useMemo(() => initialsForName(name), [name]);
  const canRenderImage = Boolean(imageUrl) && !imageUrl?.includes("placeholder.svg") && !broken;

  if (!canRenderImage) {
    return (
      <span
        aria-label={`${name} avatar`}
        className={`inline-flex items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={`${name} logo`}
      className={`rounded-full border border-slate-200 bg-white object-cover ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
