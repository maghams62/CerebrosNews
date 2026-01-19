import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((m) => {
      const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
      const content = typeof m?.content === "string" ? m.content.trim() : "";
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean) as ChatMessage[];
}

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const title = typeof body?.title === "string" ? body.title : "";
  const summary = typeof body?.summary === "string" ? body.summary : "";
  const fullText = typeof body?.fullText === "string" ? body.fullText : "";
  const analysisSummary = typeof body?.analysisSummary === "string" ? body.analysisSummary : "";
  const messages = normalizeMessages(body?.messages);

  if (!storyId || !title || (!summary && !fullText && !analysisSummary) || messages.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_openai_key" }, { status: 500 });
  }

  const articleText = clampText(
    [fullText, summary, analysisSummary].filter((part) => part && part.trim().length).join("\n\n"),
    15_000
  );

  const systemPrompt =
    "You are an article assistant. Answer using the provided article text when possible. " +
    "If the answer is not in the article, start with: \"I don't know from this article.\" " +
    "Then provide a brief, general explanation related to the question without adding article-specific facts. " +
    "If the question is broad, respond with a brief summary based on the article. " +
    "Keep responses short (1-4 sentences).";

  const contextPrompt = `Article ID: ${storyId}
Title: ${title}
Summary: ${summary || "n/a"}
Summary bullets:
${analysisSummary || "n/a"}
Full text:
${articleText}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json({ error: "ask_failed", detail: message }, { status: 500 });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "ask_failed" }, { status: 500 });
    }

    return NextResponse.json({ reply: content.trim() });
  } catch {
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}
