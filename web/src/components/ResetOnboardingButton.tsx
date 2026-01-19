"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { resetPreferencesOnly } from "@/lib/appState/storage";

export function ResetOnboardingButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
      onClick={() => {
        resetPreferencesOnly();
        router.replace("/onboarding");
      }}
    >
      Reset onboarding
    </button>
  );
}

