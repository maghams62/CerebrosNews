import crypto from "crypto";

export function canonicalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";

    const toDeleteExact = new Set([
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
    ]);

    for (const key of Array.from(u.searchParams.keys())) {
      if (toDeleteExact.has(key)) u.searchParams.delete(key);
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }

    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return input;
  }
}

export function domainFromUrl(input: string): string | null {
  try {
    const u = new URL(input);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function stableId(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

