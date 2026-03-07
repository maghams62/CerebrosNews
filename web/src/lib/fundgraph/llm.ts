import fs from "fs/promises";
import path from "path";
import { z, ZodType } from "zod";
import { ClaimCategory, ClaimEvidence } from "@/lib/fundgraph/types";
import {
  buildVerifyClaimPrompt,
  MACHINE_CITATION_SUPPORT_VALUES,
  MACHINE_FRESHNESS_VALUES,
  MACHINE_SOURCE_RELEVANCE_VALUES,
} from "@/lib/fundgraph/prompts/verifyClaim";

const EXTRACT_CATEGORIES: ClaimCategory[] = [
  "Funding",
  "Product",
  "Regulation",
  "Partnership",
  "Hiring",
  "Legal",
  "Market",
  "Infrastructure",
  "Research",
  "Other",
];

const extractClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        claimText: z.string().min(8).max(280),
        category: z.enum(EXTRACT_CATEGORIES),
        entities: z.array(z.string().min(1).max(80)).max(12),
        llmConfidence: z.number().min(0).max(1),
        citation: z.object({
          snippet: z.string().min(8).max(600),
        }),
      })
    )
    .min(1)
    .max(12),
});

const verifyClaimSchema = z.object({
  citationSupport: z.enum(MACHINE_CITATION_SUPPORT_VALUES),
  sourceRelevance: z.enum(MACHINE_SOURCE_RELEVANCE_VALUES),
  freshness: z.enum(MACHINE_FRESHNESS_VALUES),
  conflictDetected: z.boolean(),
  reasoningSummary: z.string().min(8).max(900),
  machineConfidence: z.number().min(0).max(100),
});

const explainRecommendationSchema = z.object({
  explanation: z.string().min(5).max(220),
});

const resolveConflictSchema = z.object({
  resolutionHint: z.string().min(12).max(280),
});

const GRAPH_QUERY_INTENTS = [
  "path",
  "funds_in_theme",
  "companies_linked",
  "companies_invested_by_fund",
  "companies_funded_by_both",
  "search",
] as const;

const interpretGraphQuerySchema = z.object({
  canonicalQuery: z.string().min(3).max(220),
  intent: z.enum(GRAPH_QUERY_INTENTS),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().min(4).max(240).optional(),
});

const analyzeGraphQuerySchema = z.object({
  answer: z.string().min(12).max(1_200),
  derivation_summary: z.string().min(12).max(1_000),
  path_explanations: z.array(z.string().min(6).max(220)).max(8),
  evidence_quality: z.object({
    answer_confidence: z.enum(["low", "medium", "high"]),
    explanation: z.string().min(12).max(600),
  }),
  key_takeaways: z.array(z.string().min(6).max(260)).max(5),
  next_actions: z.array(z.string().min(6).max(220)).max(6),
});

const generateFundMemoSchema = z.object({
  sections: z
    .array(
      z.object({
        key: z.string().min(2).max(80),
        title: z.string().min(2).max(120),
        content: z.string().min(16).max(10_000),
      })
    )
    .min(8)
    .max(14),
});

const generateWatchlistBriefSchema = z.object({
  sections: z
    .array(
      z.object({
        key: z.string().min(2).max(80),
        title: z.string().min(2).max(120),
        content: z.string().min(16).max(10_000),
      })
    )
    .min(5)
    .max(10),
});

const generateAdvancedSignalNarrativeSchema = z.object({
  implication_summary: z.string().min(20).max(700),
  bull_case: z.string().min(20).max(500),
  base_case: z.string().min(20).max(500),
  bear_case: z.string().min(20).max(500),
  missing_evidence: z.array(z.string().min(8).max(220)).min(2).max(5),
  confidence_change_triggers: z.array(z.string().min(8).max(220)).min(2).max(5),
  entity_impact: z
    .array(
      z.object({
        entity_id: z.string().min(1).max(120),
        entity_name: z.string().min(1).max(180),
        entity_type: z.string().min(1).max(60),
        impact_summary: z.string().min(8).max(360),
        relevance_score: z.number().min(0).max(100).optional(),
      })
    )
    .min(1)
    .max(5),
  related_signals: z
    .array(
      z.object({
        signal_id: z.string().min(1).max(120),
        title: z.string().min(1).max(240),
        relation_type: z.enum(["same_theme", "same_entity", "similar_pattern", "same_fund"]),
        similarity_score: z.number().min(0).max(1).optional(),
      })
    )
    .max(5),
  next_questions: z.array(z.string().min(8).max(220)).min(3).max(5),
  graph_insight_summary: z.string().min(20).max(500),
  historical_context: z.string().min(20).max(500),
  analyst_note: z.object({
    summary: z.string().min(20).max(500),
    bullets: z.array(z.string().min(8).max(220)).min(3).max(3),
  }),
});

const extractGraphFactsSchema = z.object({
  source: z.object({
    sourceId: z.string().min(1).max(160),
    title: z.string().min(1).max(500),
    url: z.string().min(1).max(1200),
    publishedAt: z.string().max(80),
    sourceType: z.enum(["NEWS_ARTICLE", "URL", "PASTED_TEXT", "OTHER"]),
  }),
  entities: z.object({
    funds: z
      .array(
        z.object({
          name: z.string().min(1).max(180),
          canonicalName: z.string().min(1).max(180),
          rawMention: z.string().min(1).max(280),
          fundIdHint: z.string().max(160),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(120),
    companies: z
      .array(
        z.object({
          name: z.string().min(1).max(180),
          canonicalName: z.string().min(1).max(180),
          rawMention: z.string().min(1).max(280),
          companyIdHint: z.string().max(160),
          sectors: z.array(z.string().min(1).max(64)).max(10),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(240),
    people: z
      .array(
        z.object({
          name: z.string().min(1).max(180),
          canonicalName: z.string().min(1).max(180),
          rawMention: z.string().min(1).max(280),
          role: z.string().max(120),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(240),
  }),
  citations: z
    .array(
      z.object({
        citationId: z.string().min(1).max(180),
        url: z.string().min(1).max(1200),
        title: z.string().min(1).max(500),
        snippet: z.string().min(1).max(1_500),
        publishedAt: z.string().max(80),
        origin: z.enum(["scraped", "manual", "synthetic"]),
      })
    )
    .max(260),
  facts: z.object({
    deals: z
      .array(
        z.object({
          factId: z.string().min(1).max(180),
          relationType: z.literal("INVESTED_IN"),
          fundName: z.string().min(1).max(180),
          companyName: z.string().min(1).max(180),
          roundStage: z.string().min(1).max(60),
          announcedAt: z.string().max(80),
          amountMinM: z.number().nonnegative().nullable(),
          amountMaxM: z.number().nonnegative().nullable(),
          currency: z.string().min(1).max(16),
          checkType: z.enum(["lead", "follow", "unknown"]),
          coInvestors: z.array(z.string().min(1).max(180)).max(40),
          verified: z.boolean(),
          citationIds: z.array(z.string().min(1).max(180)).max(32),
          citationCount: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(320),
    fundMetadata: z
      .array(
        z.object({
          factId: z.string().min(1).max(180),
          fundName: z.string().min(1).max(180),
          field: z.string().min(1).max(80),
          value: z.string().min(1).max(260),
          verified: z.boolean(),
          citationIds: z.array(z.string().min(1).max(180)).max(32),
          citationCount: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(320),
    companyMetadata: z
      .array(
        z.object({
          factId: z.string().min(1).max(180),
          companyName: z.string().min(1).max(180),
          field: z.string().min(1).max(80),
          value: z.string().min(1).max(260),
          verified: z.boolean(),
          citationIds: z.array(z.string().min(1).max(180)).max(32),
          citationCount: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(320),
    signals: z
      .array(
        z.object({
          signalId: z.string().min(1).max(180),
          title: z.string().min(1).max(220),
          summary: z.string().min(1).max(600),
          eventType: z.string().min(1).max(64),
          tags: z.array(z.string().min(1).max(64)).max(12),
          linkedFundNames: z.array(z.string().min(1).max(180)).max(40),
          linkedCompanyNames: z.array(z.string().min(1).max(180)).max(80),
          verified: z.boolean(),
          citationIds: z.array(z.string().min(1).max(180)).max(32),
          citationCount: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(420),
    relationships: z
      .array(
        z.object({
          factId: z.string().min(1).max(180),
          relationType: z.enum(["CO_INVESTED", "MANAGED_BY", "MENTIONS", "SUPPORTED_BY"]),
          leftEntity: z.string().min(1).max(180),
          rightEntity: z.string().min(1).max(180),
          details: z.string().max(420),
          verified: z.boolean(),
          citationIds: z.array(z.string().min(1).max(180)).max(32),
          citationCount: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(420),
  }),
  coverage: z.object({
    eligibleMetricCount: z.number().int().nonnegative(),
    citedMetricCount: z.number().int().nonnegative(),
    citedCoverage: z.number().min(0).max(1),
    readyForFullAnalytics: z.boolean(),
  }),
  notes: z
    .object({
      droppedClaims: z
        .array(
          z.object({
            text: z.string().min(1).max(400),
            reason: z.string().min(1).max(200),
          })
        )
        .max(200),
    })
    .optional(),
});

export type ExtractGraphFactsWithLlmResult = z.infer<typeof extractGraphFactsSchema>;

function extractJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) {
      throw new Error("No JSON object found in model response");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function interpolatePrompt(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function promptPath(
  name:
    | "extract_claims"
    | "extract_graph_facts"
    | "verify_claim"
    | "explain_recommendation"
    | "resolve_conflict"
    | "interpret_graph_query"
    | "analyze_graph_query"
    | "generate_fund_memo"
    | "generate_watchlist_brief"
    | "generate_advanced_signal_analysis"
): string {
  return path.join(process.cwd(), "..", "packages", "llm", "prompts", "fundgraph", `${name}.prompt`);
}

async function loadPrompt(
  name:
    | "extract_claims"
    | "extract_graph_facts"
    | "verify_claim"
    | "explain_recommendation"
    | "resolve_conflict"
    | "interpret_graph_query"
    | "analyze_graph_query"
    | "generate_fund_memo"
    | "generate_watchlist_brief"
    | "generate_advanced_signal_analysis"
): Promise<string> {
  try {
    return await fs.readFile(promptPath(name), "utf8");
  } catch {
    if (name === "extract_claims") {
      return [
        "Extract 5-12 factual claims from the article.",
        "Return JSON only with shape { claims: [{ claimText, category, entities, llmConfidence, citation: { snippet } }] }.",
        "Evidence snippet must be copied verbatim.",
        "Title: {{title}}",
        "URL: {{url}}",
        "Content: {{content}}",
      ].join("\n");
    }
    if (name === "extract_graph_facts") {
      return [
        "Extract citation-backed graph facts from the source.",
        "Return JSON only using this exact shape:",
        "{ source, entities, citations, facts, coverage, notes }",
        "Do not invent entities or numbers.",
        "Each numeric fact must include citationIds and citationCount.",
        "Use empty arrays for missing sections.",
        "Source ID: {{sourceId}}",
        "Title: {{title}}",
        "URL: {{url}}",
        "Published at: {{publishedAt}}",
        "Source name: {{sourceName}}",
        "Known funds: {{knownFunds}}",
        "Known companies: {{knownCompanies}}",
        "Known people: {{knownPeople}}",
        "Content: {{content}}",
      ].join("\n");
    }
    if (name === "verify_claim") {
      return [
        "Verify if the claim is supported by the snippet.",
        "Return JSON only: { verdict: supported|unsupported|mixed, rationale, confidence }.",
        "Claim: {{claim}}",
        "Snippet: {{snippet}}",
      ].join("\n");
    }
    if (name === "resolve_conflict") {
      return [
        "You are resolving conflicting factual claims.",
        "Return JSON only: { resolutionHint }.",
        "resolutionHint must be one short sentence describing what evidence would resolve the conflict.",
        "Claim A: {{claimA}}",
        "Citation A: {{citationA}}",
        "Claim B: {{claimB}}",
        "Citation B: {{citationB}}",
      ].join("\n");
    }
    if (name === "interpret_graph_query") {
      return [
        "Translate the user query into one executable canonical graph query.",
        "Return JSON only: { canonicalQuery, intent, confidence, rationale }.",
        "Allowed intents: path|funds_in_theme|companies_linked|companies_invested_by_fund|companies_funded_by_both|search.",
        "If query is conversational, remove filler language and preserve the primary graph action.",
        "Normalize common aliases when labels support it: a16z -> Andreessen Horowitz, YC -> Y Combinator, 11 Labs -> ElevenLabs.",
        "Disambiguation priority:",
        "1) companies funded by both <Fund A> and <Fund B>",
        "2) companies <Fund> invested in / portfolio of <Fund>",
        "3) path between <Entity A> and <Entity B>",
        "4) funds investing in <Theme>",
        "5) companies linked to <Entity>",
        "Canonical templates:",
        "- companies <Fund> invested in",
        "- path between <Entity A> and <Entity B>",
        "- funds investing in <Theme>",
        "- companies linked to <Entity>",
        "- companies funded by both <Fund A> and <Fund B>",
        "Examples for intent disambiguation:",
        "- \"show me lightspeed portfolio companies\" => companies Lightspeed invested in",
        "- \"which companies does benchmark back\" => companies Benchmark invested in",
        "- \"what did yc invest in\" => companies Y Combinator invested in",
        "- \"what did sequoia and accel both invest in\" => companies funded by both Sequoia Capital and Accel",
        "- \"common bets for sequoia and accel\" => companies funded by both Sequoia Capital and Accel",
        "- \"how is rippling related to benchmark\" => path between Rippling and Benchmark",
        "- \"find connection from databricks to benchmark\" => path between Databricks and Benchmark",
        "- \"who is investing in AI infra\" => funds investing in AI infra",
        "- \"which investors are focused on fintech infrastructure\" => funds investing in fintech infrastructure",
        "- \"startups around elevenlabs\" => companies linked to ElevenLabs",
        "- \"who co-invests with sequoia\" => companies linked to Sequoia Capital",
        "Use intent=search only when none of the above can be mapped.",
        "Prefer entity names from Available Labels.",
        "Preset: {{presetId}}",
        "Available Labels: {{entityLabels}}",
        "Example Query Formats: {{exampleQueries}}",
        "User Query: {{query}}",
      ].join("\n");
    }
    if (name === "analyze_graph_query") {
      return [
        "You are generating a query-specific graph explanation.",
        "Return JSON only with shape:",
        '{ "answer": string, "derivation_summary": string, "path_explanations": string[], "evidence_quality": { "answer_confidence": "low"|"medium"|"high", "explanation": string }, "key_takeaways": string[], "next_actions": string[] }',
        "Use only the provided packet.",
        "Distinguish visible structure from citation-backed evidence.",
        "If evidence is weak, state that plainly.",
        "Use the confidence bucket provided in the prompt and do not invent a different one.",
        "Explanation packet: {{packet}}",
        "Computed confidence bucket: {{confidenceBucket}}",
      ].join("\n");
    }
    if (name === "generate_fund_memo") {
      return [
        "You are generating an investment memo from a structured evidence packet.",
        "Use only the provided packet. Do not hallucinate details.",
        "Every factual line should include citation markers like [S3] or [C2] when available.",
        "Return JSON only:",
        "{ sections: [{ key, title, content }] }",
        "Expected sections include executive summary, fund overview, team, strategy, portfolio, signals, network, bull case, risks, open questions, final view.",
        "Subject: {{subject}}",
        "Options: {{options}}",
        "Packet: {{packet}}",
      ].join("\n");
    }
    if (name === "generate_watchlist_brief") {
      return [
        "You are generating a watchlist brief as a combined research dossier across selected funds.",
        "Goal: summarize what changed today and synthesize shared patterns without ranking funds.",
        "Use only the provided packet. Do not invent facts.",
        "Return JSON only:",
        "{ sections: [{ key, title, content }] }",
        "Required section intent: snapshot, today highlights, per-fund research notes, combined signals, risks, next checks.",
        "For factual lines from signals/claims, include citation markers like [S2] or [C5] when available.",
        "Subject: {{subject}}",
        "Options: {{options}}",
        "Packet: {{packet}}",
      ].join("\n");
    }
    if (name === "generate_advanced_signal_analysis") {
      return [
        "You are a senior investment research analyst writing Deep Signal Analysis.",
        "Return JSON only with shape:",
        "{",
        '  "implication_summary": string,',
        '  "bull_case": string,',
        '  "base_case": string,',
        '  "bear_case": string,',
        '  "missing_evidence": string[],',
        '  "confidence_change_triggers": string[],',
        '  "entity_impact": [{ "entity_id": string, "entity_name": string, "entity_type": string, "impact_summary": string, "relevance_score"?: number }],',
        '  "related_signals": [{ "signal_id": string, "title": string, "relation_type": "same_theme"|"same_entity"|"similar_pattern"|"same_fund", "similarity_score"?: number }],',
        '  "next_questions": string[],',
        '  "graph_insight_summary": string,',
        '  "historical_context": string,',
        '  "analyst_note": { "summary": string, "bullets": string[] }',
        "}",
        "Make content additive vs free/basic view. Do not repeat raw evidence text.",
        "If signal is not funding-related, do not force funding-event terminology.",
        "Feature packet: {{packet}}",
        "Deterministic baseline: {{deterministic_base}}",
      ].join("\n");
    }
    return [
      "Explain recommendation in one sentence.",
      "Return JSON only: { explanation }.",
      "Profile: {{profile}}",
      "Fund: {{fund}}",
    ].join("\n");
  }
}

async function openaiJson<T>(params: {
  prompt: string;
  schema: ZodType<T>;
  model?: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("missing_openai_key");
  }

  const timeoutMs = Number.parseInt(process.env.FUNDGRAPH_OPENAI_TIMEOUT_MS ?? "45000", 10);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45000);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: params.temperature ?? 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a strict JSON API. Reply with JSON only.",
          },
          {
            role: "user",
            content: params.prompt,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("openai_timeout");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`openai_error:${response.status}:${detail.slice(0, 400)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim().length) {
    throw new Error("openai_empty_response");
  }

  if (process.env.NODE_ENV !== "production" && process.env.FUNDGRAPH_LOG_RAW_LLM === "1") {
    console.log("[fundgraph][llm][raw]", content);
  }

  const parsed = extractJsonFromText(content);
  return params.schema.parse(parsed);
}

export async function extractClaimsWithLlm(input: {
  title: string;
  url: string;
  content: string;
}) {
  const template = await loadPrompt("extract_claims");
  const prompt = interpolatePrompt(template, {
    title: input.title,
    url: input.url,
    content: input.content.slice(0, 20_000),
  });
  return openaiJson({ prompt, schema: extractClaimsSchema, temperature: 0.1 });
}

export async function extractGraphFactsWithLlm(input: {
  sourceId: string;
  title: string;
  url: string;
  content: string;
  publishedAt?: string;
  sourceName?: string;
  knownFunds?: string[];
  knownCompanies?: string[];
  knownPeople?: string[];
}): Promise<ExtractGraphFactsWithLlmResult> {
  const template = await loadPrompt("extract_graph_facts");
  const prompt = interpolatePrompt(template, {
    sourceId: input.sourceId.trim(),
    title: input.title.trim(),
    url: input.url.trim(),
    publishedAt: (input.publishedAt ?? "").trim(),
    sourceName: (input.sourceName ?? "").trim(),
    knownFunds: JSON.stringify(input.knownFunds ?? []).slice(0, 16_000),
    knownCompanies: JSON.stringify(input.knownCompanies ?? []).slice(0, 16_000),
    knownPeople: JSON.stringify(input.knownPeople ?? []).slice(0, 16_000),
    content: input.content.slice(0, 40_000),
  });
  return openaiJson({
    prompt,
    schema: extractGraphFactsSchema,
    temperature: 0.1,
  });
}

export async function verifyClaimWithLlm(input: {
  claim: string;
  evidence: ClaimEvidence[];
  conflicts?: Array<{ claimText: string; snippet?: string }>;
}) {
  const prompt = buildVerifyClaimPrompt({
    claimText: input.claim,
    evidence: input.evidence,
    conflicts: input.conflicts,
  });
  return openaiJson({ prompt, schema: verifyClaimSchema, temperature: 0 });
}

export async function explainRecommendationWithLlm(input: { profile: unknown; fund: unknown }) {
  const template = await loadPrompt("explain_recommendation");
  const prompt = interpolatePrompt(template, {
    profile: JSON.stringify(input.profile),
    fund: JSON.stringify(input.fund),
  });
  return openaiJson({ prompt, schema: explainRecommendationSchema, temperature: 0.1 });
}

export async function resolveConflictHintWithLlm(input: {
  claimA: string;
  citationA: string;
  claimB: string;
  citationB: string;
}) {
  const template = await loadPrompt("resolve_conflict");
  const prompt = interpolatePrompt(template, {
    claimA: input.claimA,
    citationA: input.citationA,
    claimB: input.claimB,
    citationB: input.citationB,
  });
  return openaiJson({ prompt, schema: resolveConflictSchema, temperature: 0.1 });
}

export async function interpretGraphQueryWithLlm(input: {
  query: string;
  presetId?: string;
  entityLabels: string[];
  exampleQueries?: string[];
}) {
  const template = await loadPrompt("interpret_graph_query");
  const labelLines = Array.from(new Set(input.entityLabels.map((label) => label.trim()).filter(Boolean))).slice(0, 280);
  const exampleLines = (input.exampleQueries ?? []).map((query) => query.trim()).filter(Boolean).slice(0, 20);
  const prompt = interpolatePrompt(template, {
    presetId: input.presetId?.trim() || "unknown",
    entityLabels: labelLines.length ? labelLines.join("\n") : "(none)",
    exampleQueries: exampleLines.length ? exampleLines.join("\n") : "(none)",
    query: input.query.trim(),
  });
  return openaiJson({
    prompt,
    schema: interpretGraphQuerySchema,
    temperature: 0,
  });
}

export async function analyzeGraphQueryWithLlm(input: {
  packet: Record<string, unknown>;
  confidenceBucket: "low" | "medium" | "high";
}) {
  const template = await loadPrompt("analyze_graph_query");
  const prompt = interpolatePrompt(template, {
    packet: JSON.stringify(input.packet).slice(0, 60_000),
    confidenceBucket: input.confidenceBucket,
  });

  return openaiJson({
    prompt,
    schema: analyzeGraphQuerySchema,
    temperature: 0.2,
  });
}

export async function generateFundMemoWithLlm(input: {
  subject: { fundId: string; fundName: string };
  options: Record<string, unknown>;
  packet: Record<string, unknown>;
}) {
  const template = await loadPrompt("generate_fund_memo");
  const prompt = interpolatePrompt(template, {
    subject: JSON.stringify(input.subject),
    options: JSON.stringify(input.options),
    packet: JSON.stringify(input.packet).slice(0, 120_000),
  });
  return openaiJson({
    prompt,
    schema: generateFundMemoSchema,
    temperature: 0.2,
  });
}

export async function generateWatchlistBriefWithLlm(input: {
  subject: Record<string, unknown>;
  options: Record<string, unknown>;
  packet: Record<string, unknown>;
}) {
  const template = await loadPrompt("generate_watchlist_brief");
  const prompt = interpolatePrompt(template, {
    subject: JSON.stringify(input.subject),
    options: JSON.stringify(input.options),
    packet: JSON.stringify(input.packet).slice(0, 120_000),
  });
  return openaiJson({
    prompt,
    schema: generateWatchlistBriefSchema,
    temperature: 0.2,
  });
}

export async function generateAdvancedSignalNarrativeWithLlm(input: {
  packet: Record<string, unknown>;
  deterministicBase: Record<string, unknown>;
}) {
  const template = await loadPrompt("generate_advanced_signal_analysis");
  const prompt = interpolatePrompt(template, {
    packet: JSON.stringify(input.packet).slice(0, 40_000),
    deterministic_base: JSON.stringify(input.deterministicBase).slice(0, 40_000),
  });

  return openaiJson({
    prompt,
    schema: generateAdvancedSignalNarrativeSchema,
    temperature: 0.2,
  });
}
