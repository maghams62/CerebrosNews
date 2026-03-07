import { ClaimEvidence } from "@/lib/fundgraph/types";

export const MACHINE_CITATION_SUPPORT_VALUES = ["NONE", "WEAK", "MEDIUM", "STRONG"] as const;
export const MACHINE_SOURCE_RELEVANCE_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
export const MACHINE_FRESHNESS_VALUES = ["STALE", "RECENT", "TIMELY"] as const;

export interface VerifyClaimPromptInput {
  claimText: string;
  evidence: ClaimEvidence[];
  conflicts?: Array<{ claimText: string; snippet?: string }>;
}

function trimText(input: string, maxChars: number): string {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trim()}...`;
}

function serializeEvidence(evidence: ClaimEvidence[]): string {
  if (!evidence.length) return "[]";
  return JSON.stringify(
    evidence.map((item) => ({
      sourceType: item.sourceType,
      visibility: item.visibility,
      title: item.title,
      url: item.url,
      snippet: item.snippet ? trimText(item.snippet, 800) : undefined,
      note: item.note ? trimText(item.note, 400) : undefined,
      submittedAt: item.submittedAt,
      contributor: item.contributor
        ? {
            label: item.contributor.label,
            role: item.contributor.role,
            tier: item.contributor.tier,
            isAnonymous: item.contributor.isAnonymous,
          }
        : undefined,
      confidence: item.confidence,
    }))
  );
}

function serializeConflicts(conflicts?: Array<{ claimText: string; snippet?: string }>): string {
  if (!conflicts?.length) return "[]";
  return JSON.stringify(
    conflicts.map((item) => ({
      claimText: trimText(item.claimText, 280),
      snippet: item.snippet ? trimText(item.snippet, 500) : undefined,
    }))
  );
}

export function buildVerifyClaimPrompt(input: VerifyClaimPromptInput): string {
  return [
    "You are FundGraph's machine verification engine.",
    "Evaluate support for the claim using ONLY the provided evidence and conflicts list.",
    "Do not invent or infer facts outside the provided data.",
    "",
    "Scoring guidance:",
    "- citationSupport: NONE, WEAK, MEDIUM, STRONG",
    "- sourceRelevance: LOW, MEDIUM, HIGH",
    "- freshness: STALE, RECENT, TIMELY",
    "- conflictDetected: true if evidence set includes material contradiction",
    "- reasoningSummary: 1 short paragraph, factual and specific about coverage gaps",
    "- machineConfidence: integer 0-100 based only on supplied evidence",
    "",
    "If evidence is insufficient, set citationSupport to NONE or WEAK and lower machineConfidence.",
    "",
    `Claim: ${trimText(input.claimText, 400)}`,
    `EvidenceSet(JSON): ${serializeEvidence(input.evidence)}`,
    `ConflictingEvidence(JSON): ${serializeConflicts(input.conflicts)}`,
    "",
    "Return JSON only with this exact shape:",
    "{",
    '  "citationSupport": "NONE|WEAK|MEDIUM|STRONG",',
    '  "sourceRelevance": "LOW|MEDIUM|HIGH",',
    '  "freshness": "STALE|RECENT|TIMELY",',
    '  "conflictDetected": false,',
    '  "reasoningSummary": "string",',
    '  "machineConfidence": 0',
    "}",
  ].join("\n");
}
