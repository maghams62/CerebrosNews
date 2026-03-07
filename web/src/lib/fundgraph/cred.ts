import { CredBadgeTier } from "@/lib/fundgraph/types";

export function badgeForCred(cred: number): CredBadgeTier {
  if (cred >= 30) return "HIGH_SIGNAL";
  if (cred >= 15) return "VERIFIER";
  if (cred >= 5) return "CONTRIBUTOR";
  return "NEW";
}
