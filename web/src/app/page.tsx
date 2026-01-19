"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PremiumBackground } from "@/components/PremiumBackground";
import { FocusedPanel } from "@/components/FocusedPanel";
import { loadAppState } from "@/lib/appState/storage";
import { isOnboardingEnabled } from "@/lib/appState/onboardingFlag";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // If onboarding is not explicitly enabled, go straight to the feed.
    if (!isOnboardingEnabled()) {
      router.replace("/feed");
      return;
    }

    // Onboarding mode: start the flow regardless of existing prefs (debug/demo).
    router.replace("/onboarding?returnTo=/feed");
  }, [router]);

  return (
    <PremiumBackground>
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <FocusedPanel className="flex items-center justify-center">
          <div className="text-center">
            <div className="text-xs font-semibold tracking-[0.08em] text-indigo-600 uppercase">CerebrosNews</div>
            <div className="mt-2 text-xl font-bold text-slate-900">Loading…</div>
          </div>
        </FocusedPanel>
      </div>
    </PremiumBackground>
  );
}
