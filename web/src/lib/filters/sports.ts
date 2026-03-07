const SPORTS_KEYWORDS = [
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "wnba",
  "ncaa",
  "fifa",
  "epl",
  "premier league",
  "la liga",
  "serie a",
  "bundesliga",
  "uefa",
  "champions league",
  "world cup",
  "soccer",
  "football",
  "basketball",
  "baseball",
  "hockey",
  "tennis",
  "golf",
  "ufc",
  "mma",
  "playoffs",
  "touchdown",
  "rebounds",
  "assists",
  "yards",
  "goals",
  "match",
  "game",
  "team",
  "player",
  "over/under",
  "over under",
  "spread",
  "moneyline",
  "parlay",
  "win",
  "lose",
  "score",
  "final",
];

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countToken(text: string, token: string): number {
  const re = new RegExp(`\\b${token}\\b`, "g");
  return (text.match(re) ?? []).length;
}

export function looksSportsText(input: string): boolean {
  if (!input) return false;
  const normalized = normalizeText(input);
  if (!normalized) return false;

  if (SPORTS_KEYWORDS.some((k) => normalized.includes(k))) return true;

  const yesCount = countToken(normalized, "yes");
  const noCount = countToken(normalized, "no");
  const commaCount = (input.match(/,/g) ?? []).length;
  if ((yesCount >= 2 || noCount >= 2) && commaCount >= 1) return true;

  if (normalized.includes(" vs ") || normalized.includes(" vs. ")) return true;
  if (/\b(over|under)\b\s*\d+(\.\d+)?/.test(normalized)) return true;

  return false;
}
