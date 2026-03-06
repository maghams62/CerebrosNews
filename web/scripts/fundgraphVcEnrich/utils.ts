import crypto from "crypto";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeName(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
  );
}

export function normalizeTitle(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
  );
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function stableHash(parts: Array<string | number | undefined | null>, length = 20): string {
  const joined = parts.map((part) => String(part ?? "")).join("|");
  return crypto.createHash("sha256").update(joined).digest("hex").slice(0, length);
}

export function canonicalizeUrl(input: string | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    const blocked = new Set([
      "ref",
      "source",
      "feature",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_name",
      "utm_reader",
      "fbclid",
      "gclid",
    ]);
    for (const key of Array.from(parsed.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (blocked.has(lower) || lower.startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return raw.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

export function domainFromUrl(input: string | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function uniqStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = normalizeWhitespace(String(value ?? ""));
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (typeof limit === "number" && out.length >= limit) break;
  }
  return out;
}

export function chooseRicherString(
  candidates: Array<string | undefined | null>,
  fallback = ""
): string {
  const normalized = candidates
    .map((entry) => normalizeWhitespace(String(entry ?? "")))
    .filter(Boolean);
  if (!normalized.length) return fallback;
  return normalized.sort((left, right) => right.length - left.length)[0] ?? fallback;
}

export function numericSuffix(value: string): number {
  const match = value.match(/-(\d+)(?:\D*)?$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function toDayKey(value: string | undefined): string {
  const date = Date.parse(value ?? "");
  if (!Number.isFinite(date)) return "unknown-day";
  return new Date(date).toISOString().slice(0, 10);
}

export function to72hBucket(value: string | undefined): string {
  const date = Date.parse(value ?? "");
  if (!Number.isFinite(date)) return "bucket-unknown";
  const bucket = Math.floor(date / (72 * 60 * 60 * 1000));
  return `bucket-${bucket}`;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function summarizeText(input: string, maxLength = 360): string {
  const text = normalizeWhitespace(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function isLikelyTestText(input: string | undefined): boolean {
  const value = normalizeName(String(input ?? ""));
  if (!value) return false;
  return (
    value.includes("integration test source") ||
    value.includes("verification api test source") ||
    value === "test source" ||
    value.includes("test source")
  );
}

export function firstNonEmpty<T>(values: Array<T | undefined | null>, fallback: T): T {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

