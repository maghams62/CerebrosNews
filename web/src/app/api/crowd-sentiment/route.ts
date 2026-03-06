import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordSummary(comments: string[], question: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "was",
    "were",
    "been",
    "have",
    "has",
    "had",
    "will",
    "would",
    "could",
    "should",
    "about",
    "into",
    "over",
    "under",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "how",
    "not",
    "but",
    "then",
    "than",
    "they",
    "them",
    "their",
    "its",
    "you",
    "your",
    "our",
    "out",
  ]);
  const counts = new Map<string, number>();
  const text = [question, ...comments].join(" ");
  const normalized = normalizeText(text);
  normalizeText(text)
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t))
    .forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);

  const has = (terms: string[]) => terms.some((t) => normalized.includes(t));
  const lines: string[] = [];
  if (has(["confirm", "official", "statement", "announcement", "roadmap"])) {
    lines.push("Several comments point to the lack of official confirmation or a firm roadmap.");
  }
  if (has(["timeline", "deadline", "mid year", "late year", "q2", "q3", "q4", "by"])) {
    lines.push("Timing concerns show up frequently in the chatter.");
  }
  if (has(["rumor", "leak", "headline", "reporting", "chatter"])) {
    lines.push("Some commenters attribute moves to rumors or recent headlines.");
  }
  if (has(["odds", "price", "pricing", "volume", "liquidity"])) {
    lines.push("A subset of comments focuses on pricing/volume rather than fundamentals.");
  }
  if (has(["risk", "uncertain", "skeptic", "doubt", "unlikely"])) {
    lines.push("Skeptical remarks emphasize execution risk and uncertainty.");
  }
  if (has(["likely", "plausible", "momentum", "tailwind", "bullish"])) {
    lines.push("Optimistic takes cite momentum signals and upside catalysts.");
  }

  if (lines.length < 2) {
    const themes = top.length ? top.join(", ") : "key signals";
    lines.push(`Comments highlight ${themes} as the main drivers of discussion.`);
    lines.push("Overall chatter weighs signals versus risk without a clear consensus.");
  }
  return lines.slice(0, 3);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const comments: string[] = Array.isArray(body?.comments) ? body.comments.map(String).filter(Boolean) : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String).filter(Boolean) : [];

  if (!question) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      summary: keywordSummary(comments, question),
      source: "fallback",
    });
  }

  const systemPrompt =
    "You summarize crowd discussion. Be neutral, concise, and factual. Do not predict outcomes or assign probabilities. Do not add new facts. Summarize what commenters actually mention. Output 2-3 short bullet lines.";

  const userPrompt = `Market question:
${question}

Tags:
${tags.join(", ") || "n/a"}

Crowd comments:
${comments.slice(0, 30).map((c) => `- ${c}`).join("\n")}

Return JSON only: { "summary": [string, ...] }`;

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
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
      return NextResponse.json({
        summary: keywordSummary(comments, question),
        source: "fallback",
      });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({
        summary: keywordSummary(comments, question),
        source: "fallback",
      });
    }

    const parsed = JSON.parse(content);
    const summary = Array.isArray(parsed?.summary)
      ? parsed.summary.map(String).filter(Boolean).slice(0, 3)
      : [];
    if (!summary.length) {
      return NextResponse.json({
        summary: keywordSummary(comments, question),
        source: "fallback",
      });
    }
    return NextResponse.json({ summary, source: "openai" });
  } catch {
    return NextResponse.json({
      summary: keywordSummary(comments, question),
      source: "fallback",
    });
  }
}
