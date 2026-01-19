export function isOnboardingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ONBOARDING === "1" || process.env.NEXT_PUBLIC_ONBOARDING === "true";
}

export function isOnboardingDisabled(): boolean {
  return !isOnboardingEnabled();
}
