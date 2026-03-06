import { SignalReport, deriveSignalReportStatus } from "@/components/fundgraph/signalReportTypes";
import { Signal } from "@/fundgraph/types";
import { normalizeFundgraphText } from "@/lib/fundgraph/textNormalization";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function signalCounts(signal: Signal): {
  verifies: number;
  disputes: number;
  bullish: number;
  neutral: number;
  bearish: number;
  totalStances: number;
} {
  const verifies = signal.verifyCount ?? signal.verifiedCount ?? signal.verifies ?? 0;
  const disputes = signal.disagreeCount ?? signal.disputedCount ?? signal.disagrees ?? 0;
  const bullish = signal.bullishCount ?? signal.upvotes ?? 0;
  const neutral = signal.neutralCount ?? 0;
  const bearish = signal.bearishCount ?? 0;
  const totalStances = bullish + neutral + bearish;
  return {
    verifies: Math.max(0, verifies),
    disputes: Math.max(0, disputes),
    bullish: Math.max(0, bullish),
    neutral: Math.max(0, neutral),
    bearish: Math.max(0, bearish),
    totalStances: Math.max(0, totalStances),
  };
}

function parseEntities(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2}\b/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const candidate = match.trim();
    if (candidate.length < 3 || candidate.length > 40) continue;
    const lowered = candidate.toLowerCase();
    if (["the", "and", "for", "with", "from", "this", "that"].includes(lowered)) continue;
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    out.push(candidate);
    if (out.length >= 4) break;
  }
  return out;
}

function cleanSnippet(value: string, maxLength: number): string {
  return normalizeFundgraphText(value, maxLength);
}

function dedupeLabels(values: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value.trim());
    if (out.length >= limit) break;
  }
  return out;
}

function sourceTypeFromSignal(signal: Signal): string {
  if (signal.source === "system") return "DATASET";
  if (signal.source === "community") return "COMMUNITY";
  return "SOURCE";
}

function dedupeEvidenceItems(evidence: SignalReport["evidence"]): SignalReport["evidence"] {
  const seenContent = new Set<string>();
  const idCounts = new Map<string, number>();
  const out: SignalReport["evidence"] = [];

  for (const item of evidence) {
    const contentKey = `${(item.url || "").trim().toLowerCase()}|${item.title.trim().toLowerCase()}|${item.snippet
      .trim()
      .toLowerCase()
      .slice(0, 260)}`;
    if (contentKey.trim() && seenContent.has(contentKey)) continue;
    if (contentKey.trim()) seenContent.add(contentKey);

    const baseId = (item.id || "ev-item").trim() || "ev-item";
    const seen = idCounts.get(baseId) ?? 0;
    idCounts.set(baseId, seen + 1);
    const nextId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
    out.push({
      ...item,
      id: nextId,
    });
  }

  return out;
}

function buildEvidence(signal: Signal): SignalReport["evidence"] {
  const snapshot = signal.articleSnapshot;
  if (snapshot) {
    const baseId = signal.sourceId || `signal-${signal.id}`;
    const sourceType = sourceTypeFromSignal(signal);
    const publishedAt = snapshot.publishedAt || signal.createdAt;
    const sourceTitle = snapshot.sourceName || signal.sourceTitle || "Signal citation";
    const sourceUrl = snapshot.sourceUrl || signal.evidenceUrl || signal.evidence?.url || "";
    const keyFacts = (snapshot.keyFacts ?? []).slice(0, 6).map((fact) => ({
      field: fact.label,
      value: fact.value,
    }));
    const quoteItems = (snapshot.evidenceQuotes ?? []).map((quote, index) => ({
      id: quote.citationId || `ev-${signal.id}-${index + 1}`,
      source_type: sourceType,
      title: sourceTitle,
      url: quote.url || sourceUrl,
      published_at: publishedAt,
      snippet: cleanSnippet(quote.text, 260),
      why_used: "Direct quote extracted from the linked source content.",
      extracted_facts: keyFacts,
    }));
    if (quoteItems.length) return dedupeEvidenceItems(quoteItems);
    return dedupeEvidenceItems([
      {
        id: `ev-${baseId}-primary`,
        source_type: sourceType,
        title: sourceTitle,
        url: sourceUrl,
        published_at: publishedAt,
        snippet: cleanSnippet(snapshot.excerpt || signal.evidenceSnippet || signal.summary, 320),
        why_used: "Primary article snapshot used for this signal.",
        extracted_facts: keyFacts,
      },
    ]);
  }

  const url = signal.evidenceUrl || signal.evidence?.url || "";
  const snippet = signal.evidenceSnippet || signal.evidence?.snippet || "";
  if (!url && !snippet) return [];
  let title = "Signal citation";
  if (url) {
    try {
      title = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      title = "Signal citation";
    }
  }
  return dedupeEvidenceItems([
    {
      id: `ev-${signal.id}-1`,
      source_type: sourceTypeFromSignal(signal),
      title,
      url,
      published_at: signal.createdAt,
      snippet: cleanSnippet(snippet || signal.summary, 320),
      why_used: "Provided as supporting context for this signal.",
      extracted_facts: [],
    },
  ]);
}

function buildScore(signal: Signal, evidence: SignalReport["evidence"]): SignalReport["score"] {
  const { verifies, disputes, totalStances } = signalCounts(signal);
  const ageHours = Math.max(0, (Date.now() - +new Date(signal.createdAt)) / (1000 * 60 * 60));
  const recency = clamp(1 - ageHours / 96, 0.1, 1);
  const tierEvidenceBoost =
    signal.qualityTier === "ALIGNED" ? 0.95 : signal.qualityTier === "WARNING" ? 0.7 : signal.qualityTier === "FAILED" ? 0.2 : 0.5;
  const evidenceQuality = evidence.length ? tierEvidenceBoost : 0.2;
  const corroboration = evidence.length ? clamp((signal.citationMatchScore ?? 0.6) + 0.1, 0.2, 1) : 0.2;
  const sourceCredibility = signal.source === "system" ? 0.72 : 0.55;
  const networkProximity = clamp((verifies + 1) / 12, 0.1, 1);
  const engagement = clamp((totalStances + verifies - disputes + 1) / 20, 0.1, 1);
  const authorReputation = signal.authorUserId ? 0.6 : 0.45;

  const components: SignalReport["score"]["components"] = [
    { key: "evidence_quality", label: "Evidence Quality", value_0_1: Number(evidenceQuality.toFixed(3)), weight: 0.23, contribution: 0 },
    { key: "independent_corroboration", label: "Independent Corroboration", value_0_1: Number(corroboration.toFixed(3)), weight: 0.19, contribution: 0 },
    { key: "source_credibility", label: "Source Credibility", value_0_1: Number(sourceCredibility.toFixed(3)), weight: 0.16, contribution: 0 },
    { key: "recency", label: "Recency", value_0_1: Number(recency.toFixed(3)), weight: 0.12, contribution: 0 },
    { key: "network_proximity", label: "Network Proximity", value_0_1: Number(networkProximity.toFixed(3)), weight: 0.11, contribution: 0 },
    { key: "engagement", label: "Engagement", value_0_1: Number(engagement.toFixed(3)), weight: 0.1, contribution: 0 },
    { key: "author_reputation", label: "Author Reputation", value_0_1: Number(authorReputation.toFixed(3)), weight: 0.09, contribution: 0 },
  ];

  const calculated = components.map((component) => ({
    ...component,
    contribution: Number((component.value_0_1 * component.weight * 100).toFixed(2)),
  }));
  const penalties: SignalReport["score"]["penalties"] = disputes
    ? [{ key: "dispute_penalty", label: "Dispute Penalty", amount: Number(Math.min(24, disputes * 4.5).toFixed(2)) }]
    : [];
  const positive = calculated.reduce((sum, component) => sum + component.contribution, 0);
  const penalty = penalties.reduce((sum, item) => sum + item.amount, 0);
  const signalStrength = Number(clamp(positive - penalty, 0, 100).toFixed(1));
  const confidence: SignalReport["score"]["confidence"] = signalStrength >= 75 ? "high" : signalStrength >= 55 ? "medium" : "low";

  return {
    signal_strength: signalStrength,
    confidence,
    components: calculated,
    penalties,
    formula_text: "Score = Σ(weight × component) - penalties",
  };
}

function buildActivity(signal: Signal): SignalReport["verification"]["activity_log"] {
  const { verifies, disputes, bullish, neutral, bearish, totalStances } = signalCounts(signal);
  const entries: SignalReport["verification"]["activity_log"] = [];
  if (verifies > 0) {
    entries.push({
      type: "verify",
      user_display: `${verifies} community verifications`,
      ts: signal.createdAt,
    });
  }
  if (disputes > 0) {
    entries.push({
      type: "challenge",
      user_display: `${disputes} community disputes`,
      ts: signal.createdAt,
    });
  }
  if (totalStances > 0) {
    entries.push({
      type: "stance",
      user_display: `Stances — Bullish ${bullish} · Neutral ${neutral} · Bearish ${bearish}`,
      ts: signal.createdAt,
    });
  }
  if (!entries.length) {
    entries.push({
      type: "stance",
      user_display: "No verification activity yet",
      ts: signal.createdAt,
    });
  }
  return entries;
}

function buildGraph(
  signal: Signal,
  evidence: SignalReport["evidence"],
  companies: string[],
  fundName?: string
): SignalReport["graph"] {
  const nodes: SignalReport["graph"]["nodes"] = [
    {
      id: `signal-${signal.id}`,
      label: signal.title,
      type: "signal",
    },
    ...evidence.map((item, idx) => ({
      id: `evidence-${signal.id}-${idx + 1}`,
      label: item.source_type,
      type: "evidence" as const,
      evidence_id: item.id,
    })),
    ...companies.slice(0, 3).map((company, idx) => ({
      id: `entity-company-${signal.id}-${idx + 1}`,
      label: company,
      type: "entity" as const,
    })),
    ...(fundName
      ? [
          {
            id: `entity-fund-${signal.id}`,
            label: fundName,
            type: "entity" as const,
          },
        ]
      : []),
  ];

  const edges: SignalReport["graph"]["edges"] = [
    ...evidence.map((_, idx) => ({
      id: `edge-evidence-${signal.id}-${idx + 1}`,
      source: `signal-${signal.id}`,
      target: `evidence-${signal.id}-${idx + 1}`,
      label: "SUPPORTED_BY" as const,
    })),
    ...companies.slice(0, 3).map((_, idx) => ({
      id: `edge-company-${signal.id}-${idx + 1}`,
      source: `signal-${signal.id}`,
      target: `entity-company-${signal.id}-${idx + 1}`,
      label: "MENTIONS" as const,
    })),
    ...(fundName
      ? [
          {
            id: `edge-fund-${signal.id}`,
            source: `signal-${signal.id}`,
            target: `entity-fund-${signal.id}`,
            label: "MENTIONS" as const,
          },
        ]
      : []),
  ];

  return { nodes, edges };
}

export function buildSignalReport(signal: Signal, options?: { fundName?: string }): SignalReport {
  const { verifies, disputes, bullish, neutral, bearish, totalStances } = signalCounts(signal);
  const evidence = buildEvidence(signal);
  const score = buildScore(signal, evidence);
  const snapshotContext = [
    signal.articleSnapshot?.headline ?? "",
    ...(signal.articleSnapshot?.bullets ?? []),
    ...(signal.articleSnapshot?.keyFacts ?? []).map((fact) => `${fact.label} ${fact.value}`),
  ].join(" ");
  const companies = parseEntities(`${signal.title} ${signal.summary} ${snapshotContext}`);
  const themes = dedupeLabels(signal.tags ?? [], 6);
  const verification: SignalReport["verification"] = {
    verified_count: verifies,
    challenged_count: disputes,
    bullish_count: bullish,
    neutral_count: neutral,
    bearish_count: bearish,
    saves: Math.max(0, Math.floor(totalStances / 3)),
    activity_log: buildActivity(signal),
  };

  const status = deriveSignalReportStatus(verification);
  const verdict = status === "verified" ? "Verified" : status === "contested" ? "Contested" : "Unverified";

  const snapshot = signal.articleSnapshot;
  const citationIds = Array.from(new Set(evidence.map((item) => item.id)));
  const evidenceHost = snapshot?.sourceName || evidence[0]?.title || "community source";
  const hasVerificationConsensus = verifies > disputes;
  const ambiguitySignals: string[] = [];
  if (!evidence.length) ambiguitySignals.push("no direct citation attached");
  if (signal.qualityTier === "WARNING") ambiguitySignals.push("citation alignment is partial and needs review");
  if (signal.qualityTier === "FAILED") ambiguitySignals.push("citation alignment failed quality checks");
  if (disputes > verifies) ambiguitySignals.push("disputes currently outweigh verifies");
  if (verifies === 0) ambiguitySignals.push("no external verification votes yet");
  if (!ambiguitySignals.length) ambiguitySignals.push("remaining uncertainty is mostly around downstream impact, not core claim wording");
  const summaryParagraph = snapshot
    ? `${verdict} signal with ${score.confidence} confidence (${Math.round(score.signal_strength)}/100), grounded in "${snapshot.headline}" from ${evidenceHost}.`
    : `${verdict} signal with ${score.confidence} confidence (${Math.round(score.signal_strength)}/100). ${
        evidence.length
          ? `Primary evidence comes from ${evidenceHost}, and the core statement is directionally consistent with the citation snippet.`
          : "No primary evidence is attached yet, so this should be treated as an uncorroborated lead."
      }`;
  const quickTakeBullets = snapshot?.bullets?.length
    ? snapshot.bullets.slice(0, 3).map((bullet) => bullet.trim())
    : [
        evidence.length
          ? `Confirmed so far: the cited source supports the core claim framing (${evidenceHost}).`
          : "Confirmed so far: only the submitted signal text is available; independent corroboration is missing.",
        `Current ambiguity: ${ambiguitySignals.join("; ")}.`,
        hasVerificationConsensus
          ? "Disambiguation next step: add an independent source that validates key details (entities, timeline, and scope)."
          : "Disambiguation next step: resolve conflicting community interpretation with a stronger primary or official source.",
      ];

  return {
    signal: {
      id: signal.id,
      title: signal.title,
      claim: snapshot?.excerpt || signal.summary,
      signal_type: signal.source ?? "community",
      created_at: signal.createdAt,
      author: {
        id: signal.authorUserId ?? signal.userId ?? "community",
        name: signal.authorName || signal.author || "Community",
        is_anonymous: Boolean((signal.authorName || "").toLowerCase().includes("anonymous")),
        tier: "SILVER",
      },
    },
    entities: {
      companies,
      funds: options?.fundName ? [options.fundName] : [],
      people: [],
      themes,
    },
    context: {
      stage: undefined,
      sector_tags: themes,
      location: undefined,
      investors: [],
      headcount_trend: undefined,
    },
    verification,
    evidence,
    score,
    ai_summary: {
      summary_paragraph: summaryParagraph,
      bullet_justifications: quickTakeBullets,
      reasoning_trace: [
        {
          step_num: 1,
          action: "Parsed article snapshot",
          detail: snapshot
            ? `Extracted headline, key bullets, and fact anchors from ${evidenceHost}.`
            : "Identified the core entities, event type, and timeline implied by the submitted signal text.",
          citations: citationIds.slice(0, 1),
        },
        {
          step_num: 2,
          action: "Checked citation consistency and fund relevance",
          detail: evidence.length
            ? `Compared citation text against the claim and linked fund context (alignment=${Math.round((signal.alignmentScore ?? 0) * 100)}%, citation_match=${Math.round((signal.citationMatchScore ?? 0) * 100)}%).`
            : "No attached citation was available, so factual alignment could not be independently checked.",
          citations: citationIds,
        },
        {
          step_num: 3,
          action: "Scored unresolved ambiguity",
          detail: `Combined evidence presence, verification/dispute balance (${verifies}/${disputes}), and recency signals to estimate confidence.`,
          citations: [],
        },
      ],
      conclusion: {
        verdict,
        confidence: score.confidence,
        notes:
          signal.qualityReasons?.length && signal.qualityTier !== "ALIGNED"
            ? signal.qualityReasons.join("; ")
            : evidence.length
              ? undefined
              : "Add at least one evidence source to improve confidence.",
      },
    },
    challenges:
      disputes > 0
        ? [
            {
              id: `challenge-${signal.id}`,
              challenger_display: `${disputes} community dispute(s)`,
              claim: "Community members have disputed this signal.",
              citations: citationIds.slice(0, 1),
              impact: {
                score_delta: -Math.max(4, disputes * 2),
                confidence_change: score.confidence === "high" ? "High -> Medium" : "Medium -> Low",
              },
            },
          ]
        : [],
    graph: buildGraph(signal, evidence, companies, options?.fundName),
  };
}
