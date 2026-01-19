export type TrustFramingLens =
  | "product launch"
  | "market competition"
  | "security risk"
  | "policy/regulation"
  | "business strategy"
  | "human impact"
  | "science/engineering"
  | "opinion/analysis";

export type TrustFraming = {
  lens: TrustFramingLens;
  emphasis: string[];
  downplays: string[];
  language_notes: string[];
};

export type TrustSoWhat = {
  near_term: string[];
  long_term: string[];
};

export type TrustFields = {
  whats_missing: string[];
  so_what: TrustSoWhat;
  framing: TrustFraming;
};

export type TrustFieldsRecord = {
  articleId: string;
  generatedAt: string;
  model: string;
  input: {
    title: string;
    summary?: string;
    text?: string;
    sourceName?: string;
    url?: string;
    publishedAt?: string;
  };
  trust: TrustFields;
};

export type TrustFieldsDataset = {
  version: 1;
  generatedAt: string;
  model: string;
  entries: TrustFieldsRecord[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}
function asLens(value: unknown): TrustFramingLens {
  const raw = asString(value).toLowerCase();
  const allowed: TrustFramingLens[] = [
    "product launch",
    "market competition",
    "security risk",
    "policy/regulation",
    "business strategy",
    "human impact",
    "science/engineering",
    "opinion/analysis",
  ];
  const match = allowed.find((v) => v === raw);
  return match ?? "opinion/analysis";
}

function normalizeSoWhat(raw: Record<string, unknown>): TrustSoWhat {
  return {
    near_term: asStringArray(raw.near_term ?? (raw as any).nearTerm, 6),
    long_term: asStringArray(raw.long_term ?? (raw as any).longTerm, 6),
  };
}

function normalizeFraming(raw: Record<string, unknown>): TrustFraming {
  const lens = asLens(raw.lens);
  const emphasis = asStringArray(raw.emphasis, 6);
  const downplays = asStringArray(raw.downplays, 6);
  const language_notes = asStringArray(raw.language_notes ?? (raw as any).languageNotes, 4);
  return { lens, emphasis, downplays, language_notes };
}

export function normalizeTrustFields(value: unknown): TrustFields | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const whats_missing = asStringArray(raw.whats_missing ?? (raw as any).whatsMissing, 6);
  const so_what = normalizeSoWhat((raw.so_what ?? (raw as any).soWhat ?? {}) as Record<string, unknown>);
  const framing = normalizeFraming((raw.framing ?? {}) as Record<string, unknown>);

  if (!whats_missing.length && !so_what.near_term.length && !so_what.long_term.length && !framing.emphasis.length) {
    return null;
  }

  return { whats_missing, so_what, framing };
}
