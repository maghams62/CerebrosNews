import { createId } from "@/lib/fundgraph/ids";
import { getNewsSourceById, getNewsSourceByUrl } from "@/lib/fundgraph/newsSource";
import { NewsSource, Source, SourceType } from "@/lib/fundgraph/types";

export interface IngestSourceInput {
  type: SourceType;
  title?: string;
  url?: string;
  text?: string;
  file?: string;
  newsId?: string;
  metadata?: Record<string, unknown>;
}

interface CsvRow {
  [key: string]: string;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header, idx) => header || `col_${idx + 1}`);
  const rows: CsvRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function titleForType(type: SourceType): string {
  if (type === "PASTED_TEXT") return "Pasted Intelligence";
  if (type === "TWEET_THREAD_TEXT") return "Tweet Thread";
  if (type === "PDF_TEXT") return "PDF Extracted Text";
  if (type === "CSV_FUNDS") return "Funds CSV Import";
  if (type === "URL") return "URL Source";
  return "News Article";
}

function sourceUrlFallback(sourceId: string): string {
  return `https://fundgraph.local/source/${sourceId}`;
}

export function sourceToNewsSource(source: Source): NewsSource {
  const summary = source.rawText.trim().slice(0, 800);
  return {
    id: source.id,
    title: source.title,
    url: source.url || sourceUrlFallback(source.id),
    sourceName: (source.metadata?.sourceName as string) || "FundGraph Ingestion",
    summary,
    content: source.rawText,
    publishedAt: source.createdAt,
    tags: Array.isArray(source.metadata?.tags)
      ? (source.metadata?.tags as unknown[])
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [],
  };
}

export async function materializeSource(input: IngestSourceInput): Promise<Source> {
  const text = (input.text ?? input.file ?? "").trim();
  let resolvedTitle = (input.title ?? "").trim();
  let resolvedUrl = (input.url ?? "").trim();
  let rawText = text;
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };

  if (input.type === "NEWS_ARTICLE") {
    let found: NewsSource | null = null;
    if (input.newsId) {
      found = await getNewsSourceById(input.newsId);
    }
    if (!found && resolvedUrl) {
      found = await getNewsSourceByUrl(resolvedUrl);
    }

    if (found) {
      resolvedTitle = resolvedTitle || found.title;
      resolvedUrl = resolvedUrl || found.url;
      rawText = rawText || found.content || found.summary;
      metadata.newsId = found.id;
      metadata.sourceName = found.sourceName;
      metadata.publishedAt = found.publishedAt;
      metadata.tags = found.tags;
    }
  }

  if (input.type === "CSV_FUNDS") {
    const rows = parseCsv(rawText);
    const fundNameKeys = ["fund", "fund_name", "name", "fundName", "Fund", "Fund Name"];
    const extractedFundNames = rows
      .map((row) => fundNameKeys.map((key) => row[key]).find((value) => typeof value === "string" && value.trim()) || "")
      .filter(Boolean)
      .slice(0, 200);

    metadata.csv = {
      rowCount: rows.length,
      sample: rows.slice(0, 10),
      extractedFundNames,
    };
  }

  return {
    id: createId("fg-source"),
    type: input.type,
    title: resolvedTitle || titleForType(input.type),
    url: resolvedUrl || undefined,
    rawText,
    createdAt: new Date().toISOString(),
    metadata,
  };
}
