import { buildTrustPrompt } from "../../src/lib/trust/prompt";
import { normalizeTrustFields, TrustFields } from "../../src/lib/trust/schema";

type ChatMessage = { role: "system" | "user"; content: string };

type LlmJson = Record<string, unknown>;

function mustGetEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is required for LLM generation.`);
  return val;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function callOpenAiJson(
  system: string,
  user: string,
  opts?: { maxTokens?: number; timeoutMs?: number }
): Promise<LlmJson> {
  const apiKey = mustGetEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o";
  const timeoutMs = opts?.timeoutMs ?? envInt("OPENAI_TIMEOUT_MS", 90_000);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ] satisfies ChatMessage[],
        response_format: { type: "json_object" },
        temperature: 0.2,
        ...(typeof opts?.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    try {
    return JSON.parse(content) as LlmJson;
    } catch {
      // Fallback: try to recover JSON object from noisy output.
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const slice = content.slice(start, end + 1);
        return JSON.parse(slice) as LlmJson;
      }
      throw new Error("LLM returned invalid JSON.");
    }
  } catch (e) {
    // Normalize AbortError into something readable in logs.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

function normalizeTag(tag: string): string {
  return tag
    .replace(/^[#*\\s]+/, "")
    .replace(/[\\s\\-–—]+$/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function normalizeTagList(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const shortAllowlist = new Set(["AI", "ML", "GPU", "CPU", "API", "AWS", "GCP", "iOS", "SaaS"]);
  const cleaned = tags
    .map((t) => normalizeTag(String(t ?? "")))
    .filter((t) => t.length >= 2 && t.length <= 48)
    .filter((t) => {
      const tokens = t.split(" ").filter(Boolean);
      if (tokens.some((tok) => tok.length === 1)) return false;
      if (t.length <= 3 && !shortAllowlist.has(t)) return false;
      return true;
    });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of cleaned) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function generateTechTags(params: {
  title: string;
  summary?: string | null;
  text?: string | null;
}): Promise<{ tags: string[] }> {
  const model = process.env.OPENAI_TAG_MODEL ?? process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o";
  const system =
    "You assign high-level, understandable tech tags. Focus on languages, frameworks, companies, products, cloud/infra, AI/data, security, and major domains. Avoid overly granular or niche tags and avoid abbreviations unless they are widely known (e.g., AI, ML, GPU, CPU, API, AWS, GCP).";
  const summary = params.summary ?? "";
  const text = params.text ?? "";
  const user = `Create 6–10 concise tech tags for this item.\n\nRules:\n- Use widely recognized terms people would filter by.\n- Prefer high-level tags over niche details.\n- Mix categories when relevant: company/product, technology, and domain/industry.\n- Avoid versions or very specific subcomponents.\n- Prefer canonical names (e.g., “OpenAI”, “Kubernetes”, “Rust”).\n- Tags should be 1–3 words each.\n- Do NOT output partial words or trailing single-letter tokens (e.g., “Fast P”).\n\n[Title]\n${params.title}\n\n[Summary]\n${summary}\n\n[Excerpt]\n${text.slice(0, 1200)}\n\nReturn JSON: { "tags": ["..."] }`;

  const json = await callOpenAiJson(system, user, {
    maxTokens: envInt("OPENAI_TAG_MAX_TOKENS", 120),
    timeoutMs: envInt("OPENAI_TAG_TIMEOUT_MS", 90_000),
  });
  const tags = normalizeTagList(json.tags);
  if (tags.length >= 4) return { tags: tags.slice(0, 10) };
  return { tags };
}

function hasAiDisclaimer(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("as an ai") || t.includes("as a language model");
}

function countBullets(text: string): number {
  return text.split("\n").filter((line) => line.trim().startsWith("- ")).length;
}

function validateSummaryMarkdown(summary: string): boolean {
  if (!summary || summary.length < 120) return false;
  const bullets = countBullets(summary);
  if (bullets < 4 || bullets > 5) return false;
  if (hasAiDisclaimer(summary)) return false;
  return true;
}

function validateLiteSummaryMarkdown(summary: string): boolean {
  if (!summary || summary.length < 80) return false;
  const bullets = countBullets(summary);
  if (bullets < 4 || bullets > 5) return false;
  if (hasAiDisclaimer(summary)) return false;
  return true;
}

function validateGenericText(text: string, minChars = 400): boolean {
  if (!text || text.length < minChars) return false;
  if (hasAiDisclaimer(text)) return false;
  return true;
}

async function withRetry<T>(fn: (strict: boolean) => Promise<T>, validate: (val: T) => boolean): Promise<T> {
  const first = await fn(false);
  if (validate(first)) return first;
  return await fn(true);
}

export async function generateArticleSummary(params: {
  metadata: string;
  text: string;
}): Promise<{ summary_markdown: string }> {
  const system = "You are a precise news analyst. Summaries must be faithful, detailed, and easy to scan.";
  const userBase = `Summarize the article below using ONLY the provided text.\n\nOutput format (Markdown):\n- 4–5 bullets (each is a distinct, concrete fact)\n\nRules:\n- No headings or prefaces.\n- Do not invent facts; if uncertain, use cautious language.\n- Avoid vague filler.\n\n[ARTICLE METADATA]\n${params.metadata}\n\n[ARTICLE TEXT/EXCERPT]\n${params.text}\n\nReturn JSON with: { \"summary_markdown\": \"...\" }`;
  const strictSuffix = "\n\nYou must output exactly 4–5 bullet points, no extra text.";

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_SUMMARY_MAX_TOKENS", 900) });
      return { summary_markdown: String(json.summary_markdown ?? "") };
    },
    (val) => validateSummaryMarkdown(val.summary_markdown)
  );
}

export async function generateArticleSummaryLite(params: {
  metadata: string;
  text: string;
}): Promise<{ summary_markdown: string }> {
  const system = "You are a fast, faithful news summarizer. Be concise and avoid filler.";
  const userBase = `Summarize the article below using ONLY the provided text.\n\nOutput format (Markdown):\n- 4–5 bullets (each is a distinct, concrete fact)\n\nRules:\n- Do not invent facts.\n- No headings or prefaces (do not write “Key points:” or similar).\n\n[ARTICLE METADATA]\n${params.metadata}\n\n[ARTICLE TEXT/EXCERPT]\n${params.text}\n\nReturn JSON with: { \"summary_markdown\": \"...\" }`;
  const strictSuffix = "\n\nYou must output exactly 4–5 bullet points, no headings.";

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_SUMMARY_LITE_MAX_TOKENS", 220) });
      let summary = String(json.summary_markdown ?? "");
      // Remove common prefixes if the model adds them anyway.
      summary = summary.replace(/^\\s*Key points:?\\s*/i, "");
      return { summary_markdown: summary };
    },
    (val) => validateLiteSummaryMarkdown(val.summary_markdown)
  );
}

export async function generateArticleBundle(params: {
  metadata: string;
  text: string;
}): Promise<{
  summary: string[];
  bias: { vestedInterests: string[]; framingBias: string[]; confidence: "low" | "medium" | "high" };
  whatsMissing: string[];
  impact: { shortTerm: string[]; longTerm: string[] };
}> {
  const system =
    "You are a careful news analyst. Be neutral, precise, concise. Do not invent facts.";
  const user = `Analyze the article below and return JSON only.\n\nSummary rules:\n- 3–6 bullets, snapshot-style\n- Each bullet ≤ 14 words\n- No headings/prefaces\n- Do NOT include metadata like Source/Published/Topics/Domain\n- When text is thin, you MAY add 1–2 \"Context:\" bullets.\n  - Context bullets must be cautious (may/could/likely).\n  - They should provide background framing, not new claims.\n\nReasoning guide (do not output this):\n1) Identify the main event/claim and the actor.\n2) Add concrete supporting details (numbers, dates, product names) if present.\n3) Add 0–2 implications or next steps grounded in the text.\n4) If text is thin, add 1 \"Context:\" bullet using safe, general knowledge.\n\nGood summary examples:\nTitle: \"TSMC says AI demand is endless after record Q4 earnings\"\nBullets:\n- TSMC reports record Q4 revenue driven by AI chip orders.\n- Management says AI demand remains strong into 2026.\n- Capex guidance rises to expand advanced-node capacity.\n- Context: TSMC is the dominant foundry for advanced AI chips.\n\nTitle: \"MinIO has shut down, but I've found an alternative\" (thin text)\nBullets:\n- MinIO shutdown may push self-hosting users to seek replacements.\n- The author argues an alternative could offer better durability.\n- Context: Storage platform changes often trigger migration concerns.\n\nTitle: \"Startup X launches open-source AI agent framework\"\nBullets:\n- Startup X released an open-source agent framework for developers.\n- It targets workflow automation and tool integration.\n- Early adopters may evaluate it against existing agent stacks.\n\nBias rules:\n- vestedInterests: who benefits if framing is accepted (or empty)\n- framingBias: angles emphasized/minimized (or empty)\n- confidence: low|medium|high (default low if unclear)\n- use “may/could/appears”; be cautious\n\nWhat’s missing:\n- 0–4 bullets of concrete gaps (stakeholders/data/risks/context); no generic filler\n\nImpact:\n- shortTerm: 0–3 bullets (weeks–months), cautious\n- longTerm: 0–3 bullets (months–years), cautious\n\nJSON only:\n{\n  \"summary\": [\"...\"],\n  \"bias\": {\n    \"vestedInterests\": [\"...\"],\n    \"framingBias\": [\"...\"],\n    \"confidence\": \"low|medium|high\"\n  },\n  \"whatsMissing\": [\"...\"],\n  \"impact\": {\n    \"shortTerm\": [\"...\"],\n    \"longTerm\": [\"...\"]\n  }\n}\n\n[ARTICLE METADATA]\n${params.metadata}\n\n[ARTICLE TEXT/EXCERPT]\n${params.text}`;

  const json = await callOpenAiJson(system, user, { maxTokens: envInt("OPENAI_BUNDLE_MAX_TOKENS", 180) });
  const summaryRaw = Array.isArray(json.summary) ? (json.summary as string[]).map((s) => String(s).trim()) : [];
  const summary = summaryRaw
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .slice(0, 5);
  if (summary.length < 2) {
    const fallback = summaryRaw.map((s) => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean).slice(0, 1);
    if (fallback.length) summary.push(...fallback);
  }
  const biasRaw = (json.bias && typeof json.bias === "object" ? (json.bias as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const vestedInterests = Array.isArray(biasRaw.vestedInterests)
    ? (biasRaw.vestedInterests as string[]).map((s) => String(s))
    : [];
  const framingBias = Array.isArray(biasRaw.framingBias) ? (biasRaw.framingBias as string[]).map((s) => String(s)) : [];
  const confidenceRaw = typeof biasRaw.confidence === "string" ? biasRaw.confidence.toLowerCase() : "low";
  const confidence = confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low";
  const whatsMissing = Array.isArray(json.whatsMissing) ? (json.whatsMissing as string[]).map((s) => String(s)) : [];
  const impactRaw =
    json.impact && typeof json.impact === "object" ? (json.impact as Record<string, unknown>) : ({} as Record<string, unknown>);
  const shortTerm = Array.isArray(impactRaw.shortTerm) ? (impactRaw.shortTerm as string[]).map((s) => String(s)) : [];
  const longTerm = Array.isArray(impactRaw.longTerm) ? (impactRaw.longTerm as string[]).map((s) => String(s)) : [];

  return {
    summary,
    bias: {
      vestedInterests: vestedInterests.length ? vestedInterests : ["No clear vested interest identified."],
      framingBias,
      confidence,
    },
    whatsMissing,
    impact: { shortTerm, longTerm },
  };
}

export async function generateTitleOnlySummary(params: {
  metadata: string;
  title: string;
}): Promise<{ summary: string[] }> {
  const system = "You create clear, demo-ready takeaways from minimal info.";
  const user = `Create 4–5 bullet takeaways based on the title and metadata below.\n\nRules:\n- You MAY infer plausible background; mark it with \"Context:\" if not explicit.\n- No headings/prefaces.\n- Each bullet ≤ 16 words.\n- Do NOT include Source/Published/Topics/Domain.\n- Avoid vague filler.\n\nReasoning guide (do not output this):\n1) Restate the core event in plain language.\n2) Add concrete implications or next steps.\n3) Add 1 context bullet with safe, general background.\n4) Keep bullets distinct and informative.\n\n[METADATA]\n${params.metadata}\n\n[TITLE]\n${params.title}\n\nReturn JSON: { \"summary\": [\"...\"] }`;
  try {
    const json = await callOpenAiJson(system, user, { maxTokens: envInt("OPENAI_TITLE_SUMMARY_MAX_TOKENS", 220) });
    const raw = Array.isArray(json.summary) ? (json.summary as string[]).map((s) => String(s).trim()) : [];
    const cleaned = raw.filter(Boolean).slice(0, 5);
    if (cleaned.length) return { summary: cleaned };
  } catch {
    // fall through to local fallback
  }

  const base = params.title?.trim() ? [params.title.trim()] : [];
  const fallback = [
    ...base,
    "Context: This is a developing tech story; details may evolve.",
    "Context: Industry competition or regulatory scrutiny may be a factor.",
  ];
  return { summary: fallback.slice(0, 5) };
}

export async function generateTrustFields(params: {
  metadata: string;
  text: string;
}): Promise<TrustFields> {
  const prompt = buildTrustPrompt({ metadata: params.metadata, text: params.text });
  const validate = (val: TrustFields) => {
    const hasMissing = Array.isArray(val.whats_missing) && val.whats_missing.length >= 1;
    const hasNear = Array.isArray(val.so_what?.near_term) && val.so_what.near_term.length >= 1;
    const hasLens = Boolean(val.framing?.lens);
    return hasMissing && hasNear && hasLens;
  };

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(prompt.system, strict ? prompt.strictUser : prompt.user, {
        maxTokens: envInt("OPENAI_TRUST_FIELDS_MAX_TOKENS", 420),
      });
      const normalized = normalizeTrustFields(json);
      if (!normalized) {
        return {
          whats_missing: [],
          so_what: { near_term: [], long_term: [] },
          framing: { lens: "opinion/analysis", emphasis: [], downplays: [], language_notes: [] },
        };
      }
      return normalized;
    },
    validate
  );
}

export async function generateAudienceReaction(params: {
  metadata: string;
  text: string;
  comments?: string[];
  inferred: boolean;
}): Promise<{ summary: string }> {
  const system = "You summarize audience reaction succinctly and cautiously.";
  if (!params.inferred && params.comments?.length) {
    const user = `Summarize the audience reaction based ONLY on these comments.\n\nRules:\n- 1–2 short sentences\n- No headings or prefaces\n- Mention if sentiment is mixed\n\n[COMMENTS]\n${params.comments.map((c) => `- ${c}`).join("\n")}\n\nReturn JSON: { \"summary\": \"...\" }`;
    const json = await callOpenAiJson(system, user, { maxTokens: envInt("OPENAI_REACTION_MAX_TOKENS", 120) });
    return { summary: String(json.summary ?? "") };
  }

  const user = `Infer likely audience reaction from the article text (no real comments provided).\n\nRules:\n- Must start with \"Inferred reaction:\"\n- 1 short sentence\n- Cautious wording (may/could/likely)\n\n[ARTICLE METADATA]\n${params.metadata}\n\n[ARTICLE TEXT]\n${params.text}\n\nReturn JSON: { \"summary\": \"...\" }`;
  const json = await callOpenAiJson(system, user, { maxTokens: envInt("OPENAI_REACTION_MAX_TOKENS", 120) });
  return { summary: String(json.summary ?? "") };
}

export async function generateArticleBias(params: {
  metadata: string;
  text: string;
}): Promise<{ bias: string }> {
  const system = "You detect potential bias and incentives without making defamatory claims.";
  const userBase = `Analyze potential bias / vested interests for this article and source.\nOutput:\n\n* “Source context”: what the outlet is known for (1–3 bullets, cautious)\n* “Possible incentives”: ads, affiliates, ideological tilt, ownership, audience (bullets)\n* “Language signals”: emotionally loaded wording, framing choices (quote short phrases if present)\n* “Confidence”: Low/Medium/High with 1-sentence rationale\n  Rules:\n* Be careful: use “may”, “could”, “suggests”.\n* If you don’t know ownership/incentives from the text, say “Unknown from provided info.”\n  Use:\n  [METADATA + TEXT]\n\n[METADATA + TEXT]\n${params.metadata}\n\n${params.text}\n\nReturn JSON with: { \"bias\": \"...\" }`;
  const strictSuffix = "\n\nFollow the structure exactly with bullet lists.";

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_BIAS_MAX_TOKENS", 450) });
      return { bias: String(json.bias ?? "") };
    },
    (val) => validateGenericText(val.bias, 350)
  );
}

export async function generateClusterMissing(params: {
  variants: string;
}): Promise<{ missing: string }> {
  const system = "You compare coverage across sources.";
  const userBase = `Given these variants of the same story, identify what’s missing or underexplained.\nOutput:\n\n* “Common ground” (bullets)\n* “Differences in framing” (bullets by source)\n* “What’s missing” (bullets: facts, stakeholder perspectives, historical context, counterarguments)\n* “Questions to ask next” (5 bullets)\n  Rules:\n* Only compare what’s present in the provided excerpts.\n* Don’t hallucinate details.\n  Input:\n  [VARIANT LIST: source, title, excerpt/summary]\n\n[VARIANT LIST]\n${params.variants}\n\nReturn JSON with: { \"missing\": \"...\" }`;
  const strictSuffix = "\n\nFollow the structure exactly and include bullet lists for each section.";

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_CLUSTER_MISSING_MAX_TOKENS", 650) });
      return { missing: String(json.missing ?? "") };
    },
    (val) => validateGenericText(val.missing, 400)
  );
}

export async function generateClusterImpact(params: {
  summary: string;
  variants: string;
}): Promise<{ impact: string }> {
  const system = "You are an analyst focusing on implications.";
  const userBase = `Write an “Impact” section for this story:\n\n* “Immediate impact” (bullets)\n* “Second-order effects” (bullets)\n* “Who benefits / who loses” (bullets)\n* “Timeline to watch” (bullets)\n* “Practical takeaway” (1–2 sentences)\n  Rules: no invented facts; if uncertain, label as speculation.\n  Input:\n  [CLUSTER SUMMARY + VARIANT EXCERPTS]\n\n[CLUSTER SUMMARY]\n${params.summary}\n\n[VARIANT EXCERPTS]\n${params.variants}\n\nReturn JSON with: { \"impact\": \"...\" }`;
  const strictSuffix = "\n\nFollow the structure exactly and use bullets for all sections.";

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_CLUSTER_IMPACT_MAX_TOKENS", 650) });
      return { impact: String(json.impact ?? "") };
    },
    (val) => validateGenericText(val.impact, 400)
  );
}

export async function generateArticleClaims(params: {
  metadata: string;
  text: string;
}): Promise<{ claims: string[]; vestedInterest: string }> {
  const system = "You extract factual claims and note potential vested interests cautiously.";
  const userBase = `From the article below, extract up to 6 verifiable claims (short bullet strings) and note any vested interest hints about the source.\nReturn JSON: { \"claims\": [\"...\"], \"vestedInterest\": \"...\" }\nIf claims are unclear, return an empty array.\n[METADATA]\n${params.metadata}\n[TEXT]\n${params.text}`;
  const strictSuffix = "\n\nClaims should be concise factual statements, not opinions.";

  const validate = (val: { claims: string[]; vestedInterest: string }) => {
    if (!Array.isArray(val.claims)) return false;
    if (!val.vestedInterest || val.vestedInterest.length < 50) return false;
    return true;
  };

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_CLAIMS_MAX_TOKENS", 300) });
      return {
        claims: Array.isArray(json.claims) ? (json.claims as string[]).map((c) => String(c)) : [],
        vestedInterest: String(json.vestedInterest ?? ""),
      };
    },
    validate
  );
}

export async function generateClusterTrustMeta(params: {
  variants: string;
}): Promise<{
  framing: string;
  sentiment: string;
  agreement: string;
  confidence: string;
  framingSpectrum: string;
  coverageMix: string;
  selectionSignals: string;
}> {
  const system = "You assess comparative coverage quality and framing.";
  const userBase = `For these variants of a story, produce the fields below. Keep each section concise (2-5 bullets or short paragraph).\nReturn JSON with keys: framing, sentiment, agreement, confidence, framingSpectrum, coverageMix, selectionSignals.\nVariants:\n${params.variants}`;
  const strictSuffix = "\n\nUse bullet lists where possible and avoid generic filler.";

  const validate = (val: Record<string, unknown>) => {
    const required = ["framing", "sentiment", "agreement", "confidence", "framingSpectrum", "coverageMix", "selectionSignals"];
    return required.every((k) => typeof val[k] === "string" && String(val[k]).length >= 80);
  };

  return await withRetry(
    async (strict) => {
      const json = await callOpenAiJson(system, strict ? `${userBase}${strictSuffix}` : userBase, { maxTokens: envInt("OPENAI_CLUSTER_TRUST_META_MAX_TOKENS", 700) });
      return {
        framing: String(json.framing ?? ""),
        sentiment: String(json.sentiment ?? ""),
        agreement: String(json.agreement ?? ""),
        confidence: String(json.confidence ?? ""),
        framingSpectrum: String(json.framingSpectrum ?? ""),
        coverageMix: String(json.coverageMix ?? ""),
        selectionSignals: String(json.selectionSignals ?? ""),
      };
    },
    validate
  );
}
