const HTML_TAG_PATTERN = /<[^>]+>/g;
const ENTITY_PATTERN = /&(?:nbsp|amp|lt|gt|quot|#39|#x27|#x2f);/gi;
const HARD_NOISE_PATTERN =
  /(error\s*404|404\s*:\s*not[_\s-]?found|code\s*:\s*deployment[_\s-]?not[_\s-]?found|deployment[_\s-]?not[_\s-]?found|this\s+deployment\s+cannot\s+be\s+found|for\s+more\s+information\s+and\s+troubleshooting,\s+see\s+our\s+documentation|no\s+items\s+found|what['’]?s\s+with\s+the\s+dog|page\s+not\s+found|this\s+page\s+could\s+not\s+be\s+found|we couldn['’]t find the page|skip\s+to\s+(?:main\s+)?content|open\s*menu|close\s*menu|toggle\s*menu|privacy\s*policy|terms\s*of\s*use|previous\s+slide|next\s+slide|read\s+full\s+article|all\s+rights\s+reserved|home\s*team\s*founders?|portfolio\s*publications?|building\s+great\s+companies\s+is\s+a\s+craft|more\s+info:\s*@)/i;
const NAV_FRAGMENT_PATTERN =
  /\b(companies|team|people|news\s*&\s*insights|investments|jobs|writing|search|global|emeri?tus|filters?|about|portfolio)\b/gi;
const FIELD_TRANSITION_PATTERN = /\b(Based In|Specialty|Focus|Role|Sector|Location)(?=[A-Za-z])/g;
const FIELD_TOKEN_PATTERN =
  /\b(Based In|Specialty|Focus|Role|Sector|Location)\b\s+(.+?)(?=\s+\b(?:Based In|Specialty|Focus|Role|Sector|Location)\b|$)/gi;
const CORPORATE_ADDRESS_PATTERN =
  /\b\d{2,5}\s+[A-Za-z0-9.\- ]{2,40}\s+(Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/i;
const ZIP_PATTERN = /\b\d{5}(?:-\d{4})?\b/;
const SQUEEZED_NAV_WORD_PATTERN = /(home|team|founders?|portfolio|publications?|companies|about|people|investments?|jobs|writing|search|global|news|insights){3,}/gi;
const COLLAPSED_NAV_SIGNATURES = [
  "hometeamfounders",
  "portfoliopublications",
  "companiesteamnewsinsights",
  "buildinggreatcompaniesisacraft",
  "seriesscalepupai",
];

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collapsedSignature(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsCollapsedNavSignature(value: string): boolean {
  const collapsed = collapsedSignature(value);
  if (!collapsed) return false;
  return COLLAPSED_NAV_SIGNATURES.some((signature) => collapsed.includes(signature));
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (!value || value.length <= maxLength) return value;
  const sentenceStop = Math.max(
    value.lastIndexOf(". ", maxLength - 1),
    value.lastIndexOf("! ", maxLength - 1),
    value.lastIndexOf("? ", maxLength - 1),
    value.lastIndexOf("; ", maxLength - 1)
  );
  if (sentenceStop >= Math.floor(maxLength * 0.55)) {
    return value.slice(0, sentenceStop + 1).trim();
  }
  const wordStop = value.lastIndexOf(" ", maxLength - 1);
  if (wordStop >= Math.floor(maxLength * 0.7)) {
    return value.slice(0, wordStop).trim();
  }
  return value.slice(0, maxLength).trim();
}

function collapseImmediateRepeatedPhrases(value: string): string {
  const words = collapseWhitespace(value).split(" ").filter(Boolean);
  if (!words.length) return "";

  const out: string[] = [];
  let index = 0;
  while (index < words.length) {
    const word = words[index]!;
    out.push(word);
    index += 1;

    let skipped = false;
    const maxGram = Math.min(10, out.length, words.length - index);
    for (let gram = maxGram; gram >= 2; gram -= 1) {
      const left = out.slice(out.length - gram).join(" ").toLowerCase();
      const right = words.slice(index, index + gram).join(" ").toLowerCase();
      if (!left || !right || left !== right) continue;
      index += gram;
      skipped = true;
      break;
    }
    if (skipped) continue;
  }

  return out.join(" ");
}

function normalizeTokenBoundaries(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(FIELD_TRANSITION_PATTERN, "$1 ")
    .replace(/([a-z])([A-Z][a-z]+\s+[A-Z][a-z]+)/g, "$1 $2");
}

function stripNavFragments(value: string): string {
  const tokens = value.match(NAV_FRAGMENT_PATTERN) ?? [];
  if (tokens.length < 7) return value;

  let next = value;
  const denseRepeats = [
    /(?:\bCompanies\b\s*\bTeam\b\s*\bNews\s*&\s*Insights\b\s*){2,}/gi,
    /(?:\bGlobal\b\s*){2,}/gi,
  ];
  for (const pattern of denseRepeats) {
    next = next.replace(pattern, " ");
  }

  return collapseWhitespace(next);
}

export function hasHardScrapeNoise(value: string | undefined | null): boolean {
  if (!value) return false;
  const text = String(value);
  return HARD_NOISE_PATTERN.test(text) || containsCollapsedNavSignature(text);
}

export function hasNavigationNoise(value: string | undefined | null): boolean {
  if (!value) return false;
  const tokenMatches = String(value).match(NAV_FRAGMENT_PATTERN) ?? [];
  return tokenMatches.length >= 6;
}

export function isLikelyBoilerplateScrapeText(value: string | undefined | null): boolean {
  if (!value) return false;
  const text = normalizeFundgraphText(value, 2400);
  if (!text) return true;
  if (containsCollapsedNavSignature(text)) return true;
  if (hasHardScrapeNoise(text)) return true;
  if (hasNavigationNoise(text) && text.length < 1000) return true;
  const addressHits = text.match(new RegExp(CORPORATE_ADDRESS_PATTERN.source, "gi")) ?? [];
  if (addressHits.length >= 2) return true;
  if (CORPORATE_ADDRESS_PATTERN.test(text) && ZIP_PATTERN.test(text) && /california|new york|london|boston|san francisco/i.test(text)) {
    return true;
  }
  return false;
}

export function normalizeFundgraphText(value: string | undefined | null, maxLength?: number): string {
  if (!value) return "";
  let next = String(value)
    .replace(HTML_TAG_PATTERN, " ")
    .replace(ENTITY_PATTERN, " ");
  next = decodeEntities(next);
  next = next.replace(SQUEEZED_NAV_WORD_PATTERN, " ");
  next = next.replace(/\b\d{2}\s*\/\/\s*\d{2}\b/g, " ");
  next = normalizeTokenBoundaries(next);
  next = stripNavFragments(next);
  next = collapseImmediateRepeatedPhrases(next);
  next = collapseWhitespace(next);
  if (containsCollapsedNavSignature(next)) return "";
  if (!next) return "";
  if (typeof maxLength === "number" && maxLength > 0 && next.length > maxLength) {
    const trimmed = truncateAtWordBoundary(next, Math.max(0, maxLength - 4));
    return `${trimmed}...`;
  }
  return next;
}

export function fieldLikeBullets(value: string, maxItems = 5): string[] {
  const cleaned = normalizeFundgraphText(value, 2000);
  if (!cleaned) return [];

  const bullets: string[] = [];
  for (const match of cleaned.matchAll(FIELD_TOKEN_PATTERN)) {
    const label = collapseWhitespace(match[1] ?? "");
    const rawValue = collapseWhitespace(match[2] ?? "");
    if (!label || !rawValue) continue;
    const nextValue = rawValue.replace(/\b(Based In|Specialty|Focus|Role|Sector|Location)\b.*/i, "").trim();
    if (!nextValue || nextValue.length < 2) continue;
    bullets.push(`${label}: ${nextValue}`);
    if (bullets.length >= maxItems) break;
  }

  return Array.from(new Set(bullets.map((item) => item.trim()))).slice(0, maxItems);
}
