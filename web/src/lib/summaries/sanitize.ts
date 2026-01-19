function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  const t = normalizeText(s);
  if (!t) return new Set();
  return new Set(
    t
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function extractMarkdownBullets(markdown: string | undefined | null): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

export function sanitizeSummaryBullets(params: {
  title: string;
  markdown?: string | null;
  sourceName?: string | null;
  domain?: string | null;
  publishedAt?: string | null;
  tags?: string[] | null;
  minBullets?: number;
}): string[] {
  const minBullets = Math.max(1, params.minBullets ?? 2);
  const raw = String(params.markdown ?? "");
  const lower = raw.toLowerCase();

  const bullets = extractMarkdownBullets(raw)
    .map((b) => b.replace(/^key points:?\s*/i, "").trim())
    .filter((b) => !b.toLowerCase().includes("not specified"))
    .filter((b) => !b.toLowerCase().includes("as an ai"));

  const title = params.title?.trim() ?? "";

  const tooWeak =
    !bullets.length ||
    bullets.length < minBullets ||
    lower.includes("not specified") ||
    bullets.some((b) => b.length > 220);

  if (!tooWeak) return bullets.slice(0, 6);

  // Demo-safe title-based fallback. Avoid metadata/tag bullets.
  const out: string[] = [];
  if (title) out.push(title);
  return out.slice(0, 3);
}

export function bulletsToMarkdown(bullets: string[]): string {
  return bullets.map((b) => `- ${b}`).join("\n");
}

