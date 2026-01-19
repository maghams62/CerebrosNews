import { NextResponse } from "next/server";
import path from "path";
import { config as loadEnv } from "dotenv";

export const runtime = "nodejs";

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON found");
    return JSON.parse(text.slice(start, end + 1));
  }
}

function uniqStrings(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function normalizeTags(raw: unknown, { max = 6 }: { max?: number } = {}) {
  const tags = Array.isArray(raw) ? raw : [];
  return uniqStrings(tags.map((t) => String(t ?? ""))).slice(0, max);
}

function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function heuristicTags(text: string, allowedTags?: string[]) {
  const tokens = tokenize(text);
  const joined = ` ${tokens.join(" ")} `;

  // Prefer matching allowed tags when available (dataset-derived).
  if (Array.isArray(allowedTags) && allowedTags.length) {
    const scored = allowedTags
      .map((tag) => {
        const t = String(tag ?? "").trim();
        if (!t) return null;
        const tLower = t.toLowerCase();
        // Basic scoring: token containment + substring.
        let score = 0;
        if (joined.includes(` ${tLower} `)) score += 5;
        if (joined.includes(tLower)) score += 2;
        // Bonus if any individual word in the tag appears.
        const parts = tokenize(tLower);
        for (const p of parts) {
          if (joined.includes(` ${p} `)) score += 1;
        }
        return { tag: t, score };
      })
      .filter(Boolean) as Array<{ tag: string; score: number }>;

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.tag);
  }

  // Fallback mapping for demo mode.
  const map: Record<string, string> = {
    ai: "AI",
    llm: "AI",
    openai: "AI",
    startups: "Startups",
    founder: "Startups",
    product: "Product",
    design: "Design",
    security: "Security",
    privacy: "Security",
    frontend: "Frontend",
    backend: "Backend",
    devtools: "DevTools",
    dev: "DevTools",
    data: "Data",
    policy: "Policy",
    robotics: "Robotics",
    hardware: "Hardware",
  };

  const out: string[] = [];
  for (const tok of tokens) {
    const mapped = map[tok];
    if (mapped) out.push(mapped);
  }
  return uniqStrings(out).slice(0, 6);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  const allowedTags = Array.isArray(body?.allowedTags) ? (body.allowedTags as unknown[]).map(String) : undefined;

  if (!text.trim()) {
    return NextResponse.json({ tags: [], mode: "heuristic" as const });
  }

  const env = loadEnv({ path: path.join(process.cwd(), ".env") }).parsed ?? {};
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

  // Demo fallback: no key → heuristic.
  if (!apiKey) {
    return NextResponse.json({ tags: heuristicTags(text, allowedTags), mode: "heuristic" as const });
  }

  const systemPrompt = [
    "You generate concise tech-interest tags from a short free-text description.",
    "Tags should be tech-centric: languages, frameworks, runtimes, tools, cloud/infra, data/AI/ML, security, blockchain/crypto, devops/observability, and mobile/web/backend/front-end surface areas.",
    "Prefer allowed tags when relevant; otherwise propose reasonable short tags.",
    'If there is no clear tech signal, return ["General"].',
    'Return ONLY JSON matching { "tags": ["..."] } with 2-6 items; no prose.',
  ].join(" ");

  const allowedLine =
    allowedTags && allowedTags.length
      ? `Allowed tags (prefer these exact strings when relevant): ${allowedTags.slice(0, 80).join(", ")}`
      : "Allowed tags: none (you may propose reasonable short tags).";

  const fewShot = `Examples:
Input: "I like crypto" -> { "tags": ["Crypto"] }
Input: "Rust for embedded systems and WebAssembly" -> { "tags": ["Rust", "Embedded Systems", "WebAssembly"] }
Input: "React Native, Expo, Firebase, shipping mobile apps" -> { "tags": ["React Native", "Expo", "Firebase", "Mobile Development"] }
Input: "Building LLM agents, retrieval augmented generation, vector DBs, OpenAI GPT-4" -> { "tags": ["LLM Agents", "Retrieval-Augmented Generation", "Vector Databases", "OpenAI GPT-4"] }
Input: "Kubernetes on AWS, Terraform, observability with Prometheus/Grafana" -> { "tags": ["Kubernetes", "AWS", "Terraform", "Prometheus", "Grafana", "Observability"] }
Input: "BigQuery, dbt, Airflow pipelines, data quality" -> { "tags": ["BigQuery", "dbt", "Apache Airflow", "Data Quality"] }
Input: "Pen-testing, OWASP, threat modeling, zero trust" -> { "tags": ["Penetration Testing", "OWASP", "Threat Modeling", "Zero Trust"] }
Input: "Not into tech, just cooking and sports" -> { "tags": ["General"] }
Input: "Solana, DeFi protocols, on-chain analytics, NFT tooling" -> { "tags": ["Solana", "DeFi", "On-Chain Analytics", "NFT Tooling"] }
Input: "SwiftUI + ARKit for iOS AR experiences" -> { "tags": ["SwiftUI", "ARKit", "iOS", "Augmented Reality"] }
Input: "Golang microservices, gRPC, distributed tracing with Jaeger" -> { "tags": ["Go", "Microservices", "gRPC", "Distributed Tracing", "Jaeger"] }`;

  const userPrompt = `User text:
${text}

${allowedLine}

Rules:
- 2 to 6 tags
- Each tag: 1-3 words, Title Case; keep official names (e.g., "Node.js")
- Prefer allowed tags when they fit
- No duplicates
- If nothing clearly techy: ["General"]

${fewShot}

Return JSON only with shape: { "tags": string[] }.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      // If OpenAI fails in demo, fall back rather than hard-erroring the UI.
      return NextResponse.json({ tags: heuristicTags(text, allowedTags), mode: "heuristic" as const });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ tags: heuristicTags(text, allowedTags), mode: "heuristic" as const });
    }

    const parsed = extractJson(content);
    const tags = normalizeTags(parsed?.tags, { max: 6 });
    return NextResponse.json({ tags, mode: "openai" as const });
  } catch {
    return NextResponse.json({ tags: heuristicTags(text, allowedTags), mode: "heuristic" as const });
  }
}

