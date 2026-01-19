import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON found");
    }
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const title = typeof body?.title === "string" ? body.title : "";
  const summary = typeof body?.summary === "string" ? body.summary : "";
  const publishedAt = typeof body?.publishedAt === "string" ? body.publishedAt : "";
  const tags = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const sources = Array.isArray(body?.sources) ? body.sources : [];

  if (!storyId || !title) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_openai_key" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const systemPrompt =
    "You generate a compact trust dashboard for a news story. This is a rough demo estimate; be consistent and plausible. Output JSON only.";

  const userPrompt = `Return JSON with this exact shape:
{
  "selection": { "relevance": 0-100, "freshness": 0-100, "trending": 0-100, "informationGain": 0-100 },
  "framing": { "political": 0-100, "techSentiment": 0-100, "powerLens": 0-100 },
  "coverage": {
    "independentSourceCount": integer,
    "mix": { "media": integer, "community": integer, "official": integer },
    "agreement": "High" | "Medium" | "Low"
  },
  "confidence": { "level": "High" | "Medium" | "Low", "updatedAtIso": ISO_STRING },
  "missing": { "bullets": [string, string, string] },
  "provenance": {
    "computedFromSources": integer,
    "updatedMinsAgo": integer,
    "models": { "clustering": string, "framing": string, "coverage": string }
  },
  "vestedInterestHint": boolean
}

Guidelines:
- Use only the provided inputs; do not invent named sources outside the list.
- Keep numbers plausible; avoid extremes unless clearly warranted.
- For updatedMinsAgo, estimate from now (${nowIso}) vs latest publishedAt in sources (if missing, use 240).
- Use exactly 3 missing bullets; short, specific phrases.

Story:
- id: ${storyId}
- title: ${title}
- summary: ${summary}
- publishedAt: ${publishedAt || "n/a"}
- tags: ${tags.join(", ") || "n/a"}

Sources:
${sources
  .map((s: any, idx: number) => {
    const sTitle = typeof s?.title === "string" ? s.title : "n/a";
    const sName = typeof s?.sourceName === "string" ? s.sourceName : "n/a";
    const sUrl = typeof s?.url === "string" ? s.url : "n/a";
    const sPublishedAt = typeof s?.publishedAt === "string" ? s.publishedAt : "n/a";
    return `${idx + 1}. ${sTitle} | ${sName} | ${sPublishedAt} | ${sUrl}`;
  })
  .join("\n")}
`;

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
      const message = await response.text();
      return NextResponse.json({ error: "trust_failed", detail: message }, { status: 500 });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "trust_failed" }, { status: 500 });
    }

    const parsed = extractJson(content);
    return NextResponse.json({ dashboard: parsed });
  } catch {
    return NextResponse.json({ error: "trust_failed" }, { status: 500 });
  }
}
