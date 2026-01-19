type PromptInput = {
  metadata: string;
  text: string;
};

export function buildTrustPrompt(input: PromptInput): { system: string; user: string; strictUser: string } {
  const system =
    "You are a careful news analyst. Be neutral, precise, and cautious. Do not invent facts. Avoid accusatory language.";

  const definitions = `
You are updating the TRUST FIELDS generator (summary is handled elsewhere; do NOT regenerate summary).

First, silently audit the old instructions for: unclear definitions, vague/generic bullets, accusatory bias language, missing style constraints, and lack of few-shot guidance. Then produce improved outputs that satisfy the new constraints below.

Only return machine-parseable JSON with exactly these keys:
{
  "whats_missing": ["..."],
  "so_what": { "near_term": ["..."], "long_term": ["..."] },
  "framing": {
    "lens": "...",
    "emphasis": ["..."],
    "downplays": ["..."],
    "language_notes": ["..."]
  }
}

Do NOT include summary or any extra keys. JSON only, no prose outside JSON.

WHAT'S MISSING (intent + constraints)
- Intent: identify important gaps/omissions (not truth judgments).
- Include missing stakeholders, data/benchmarks, risks/tradeoffs, counterarguments, historical context.
- 3–6 bullets, each <= 18 words, concrete (e.g., "No cost comparison given"; avoid generic "needs context").

SO WHAT / IMPLICATIONS (intent + constraints)
- Intent: why this matters and what could change next.
- near_term (weeks–months): 2–4 bullets. long_term (months–years): 2–4 bullets.
- Include practical implications, second-order effects, fit to broader trends.
- Bullets only. Avoid hype and invented facts; use cautious phrasing ("could", "may").

FRAMING / ANGLE (intent + constraints)
- Intent: describe the lens/tone and what is emphasized vs downplayed.
- lens: one of [product launch, market competition, security risk, policy/regulation, business strategy, human impact, science/engineering, opinion/analysis].
- emphasis: 2–4 bullets (what it highlights).
- downplays: 2–4 bullets (what it minimizes/ignores).
- language_notes: 1–3 bullets (tone cues: optimistic, skeptical, sensational, measured).
- Never accuse bad faith. Describe neutrally ("emphasizes", "downplays"). Avoid political labels unless explicit.

General rules:
- Be plausible; do not invent specific hard facts (numbers, dates, names) not in input.
- Bullets only; no paragraphs. Keep wording concise.
- If info is missing, still output the fields with best-effort plausible, cautious bullets.
`;

  const fewShot = `
Here is the desired output style (few-shot examples):

Example 1 (product/AI launch)
Input gist: "Company launches smaller model that runs on consumer GPUs."
Output style:
{
  "whats_missing": [
    "No benchmark vs competitors (latency/quality/cost)",
    "No mention of licensing or commercial usage limits"
  ],
  "so_what": {
    "near_term": ["More developers can deploy locally without cloud GPUs"],
    "long_term": ["Could push market toward smaller, optimized models"]
  },
  "framing": {
    "lens": "product launch",
    "emphasis": ["performance claims", "accessibility"],
    "downplays": ["limitations", "tradeoffs", "real-world eval"],
    "language_notes": ["confident marketing tone"]
  }
}

Example 2 (security/privacy)
Input gist: "New browser feature blocks third-party tracking."
Output style:
{
  "whats_missing": [
    "No detail on bypasses or edge cases",
    "No measurement of breakage for ads/publishers"
  ],
  "so_what": {
    "near_term": ["Ad tech may adapt; publishers may see revenue swings"],
    "long_term": []
  },
  "framing": {
    "lens": "policy/regulation",
    "emphasis": ["privacy wins"],
    "downplays": ["ecosystem impact", "tradeoffs"],
    "language_notes": ["measured, privacy-first tone"]
  }
}

Example 3 (market/news)
Input gist: "Startup raises funding for AI agents."
Output style:
{
  "whats_missing": [
    "No customer metrics or retention evidence",
    "No clarity on moat vs incumbents"
  ],
  "so_what": {
    "near_term": ["Hiring and expansion likely"],
    "long_term": ["Signals investor interest in agents"]
  },
  "framing": {
    "lens": "market competition",
    "emphasis": ["growth narrative"],
    "downplays": ["risks", "competitive landscape"],
    "language_notes": ["upbeat funding tone"]
  }
}
`;

  const user = `${definitions}

[ARTICLE METADATA]
${input.metadata}

[ARTICLE TEXT/EXCERPT]
${input.text}

Return JSON only in the specified shape.`;

  const strictUser = `${user}\n\n${fewShot}\n\nReturn valid JSON only. Ensure all arrays are present (use empty arrays if needed).`;

  return { system, user, strictUser };
}
