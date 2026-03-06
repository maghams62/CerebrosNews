import fs from "fs/promises";
import path from "path";

type Issue = { message: string; file?: string; line?: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function hasString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function collectDataIssues(rootDir: string): Promise<Issue[]> {
  return (async () => {
    const issues: Issue[] = [];

    const articlesPayload = await readJson(path.join(rootDir, "public", "data", "articles.json"));
    const articles = asArray<Record<string, unknown>>(
      isObject(articlesPayload) ? (articlesPayload.articles ?? []) : articlesPayload
    );
    if (!articles.length) {
      issues.push({ message: "No feed articles found in public/data/articles.json." });
    }
    articles.forEach((article, idx) => {
      if (!hasString(article.id)) issues.push({ message: `Article[${idx}] missing id.` });
      if (!hasString(article.title)) issues.push({ message: `Article[${idx}] missing title.` });
      if (!hasString(article.summary)) issues.push({ message: `Article[${idx}] missing summary.` });
      if (!hasString(article.publishedAt)) issues.push({ message: `Article[${idx}] missing publishedAt.` });
      if (!hasString(article.sourceName)) issues.push({ message: `Article[${idx}] missing sourceName.` });
      if (!hasString(article.sourceType)) issues.push({ message: `Article[${idx}] missing sourceType.` });
      if (!Array.isArray(article.tags)) issues.push({ message: `Article[${idx}] missing tags array.` });
    });

    const marketsPayload = await readJson(path.join(rootDir, "public", "data", "markets.json"));
    const markets = asArray<Record<string, unknown>>(
      isObject(marketsPayload) ? (marketsPayload.markets ?? []) : marketsPayload
    );
    markets.forEach((item, idx) => {
      const market = isObject(item.market) ? item.market : null;
      if (!hasString(item.id)) issues.push({ message: `Market[${idx}] missing id.` });
      if (!hasString(item.title)) issues.push({ message: `Market[${idx}] missing title.` });
      if (!hasString(item.summary)) issues.push({ message: `Market[${idx}] missing summary.` });
      if (!market) {
        issues.push({ message: `Market[${idx}] missing market object.` });
        return;
      }
      if (!hasString(market.platform)) issues.push({ message: `Market[${idx}] missing market.platform.` });
      if (!hasString(market.question)) issues.push({ message: `Market[${idx}] missing market.question.` });
      if (!hasFiniteNumber(market.yes)) issues.push({ message: `Market[${idx}] missing market.yes.` });
      if (!hasFiniteNumber(market.no)) issues.push({ message: `Market[${idx}] missing market.no.` });
    });

    const fundsPayload = await readJson(path.join(rootDir, "public", "data", "fundgraph", "funds.json"));
    const funds = asArray<Record<string, unknown>>(fundsPayload);
    if (!funds.length) issues.push({ message: "No fund records found in public/data/fundgraph/funds.json." });
    funds.forEach((fund, idx) => {
      if (!hasString(fund.id)) issues.push({ message: `Fund[${idx}] missing id.` });
      if (!hasString(fund.name)) issues.push({ message: `Fund[${idx}] missing name.` });
      if (!hasString(fund.headquarters)) issues.push({ message: `Fund[${idx}] missing headquarters.` });
      if (!hasString(fund.description)) issues.push({ message: `Fund[${idx}] missing description.` });
      if (!Array.isArray(fund.sectors)) issues.push({ message: `Fund[${idx}] missing sectors array.` });
      if (!Array.isArray(fund.stages)) issues.push({ message: `Fund[${idx}] missing stages array.` });
    });

    const signalsPayload = await readJson(path.join(rootDir, "public", "data", "fundgraph", "signals.json"));
    const signals = asArray<Record<string, unknown>>(signalsPayload);
    if (!signals.length) issues.push({ message: "No signal records found in public/data/fundgraph/signals.json." });
    signals.forEach((signal, idx) => {
      if (!hasString(signal.id)) issues.push({ message: `Signal[${idx}] missing id.` });
      if (!hasString(signal.fundId)) issues.push({ message: `Signal[${idx}] missing fundId.` });
      if (!hasString(signal.title)) issues.push({ message: `Signal[${idx}] missing title.` });
      if (!hasString(signal.summary)) issues.push({ message: `Signal[${idx}] missing summary.` });
      if (!hasString(signal.createdAt)) issues.push({ message: `Signal[${idx}] missing createdAt.` });
      if (!hasString(signal.authorName)) issues.push({ message: `Signal[${idx}] missing authorName.` });
    });

    return issues;
  })();
}

async function walkFiles(dir: string, collector: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walkFiles(fullPath, collector);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      collector.push(fullPath);
    }
  }
}

async function collectMockImportIssues(rootDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const files: string[] = [];
  await walkFiles(path.join(rootDir, "src"), files);
  await walkFiles(path.join(rootDir, "scripts"), files);

  const bannedPatterns: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /@\/lib\/insights\/mockInsightBundle/, message: "Banned mock insight import." },
    { pattern: /@\/lib\/feed\/mockPerspectives/, message: "Banned mock perspectives import." },
    { pattern: /@\/mocks\/signal_report/, message: "Banned mock signal report import." },
    { pattern: /@\/lib\/connectors\/mockFetch/, message: "Banned connector mock import." },
    { pattern: /buildCuratedMarkets\s*\(/, message: "Banned curated market fallback helper usage." },
    { pattern: /from\s+["']@\/lib\/fundgraph\/generator["']/, message: "Banned synthetic FundGraph generator import." },
    { pattern: /Demo synthetic/, message: "Banned demo synthetic marker string." },
    { pattern: /Generated for testing and local caching/, message: "Banned testing mock text." },
  ];

  for (const file of files) {
    const relative = path.relative(rootDir, file);
    if (relative === "scripts/auditDataCoverage.ts") continue;
    const content = await fs.readFile(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      for (const banned of bannedPatterns) {
        if (!banned.pattern.test(line)) continue;
        issues.push({
          file: relative,
          line: index + 1,
          message: banned.message,
        });
      }
    });
  }

  return issues;
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const [dataIssues, mockIssues] = await Promise.all([
    collectDataIssues(rootDir),
    collectMockImportIssues(rootDir),
  ]);
  const issues = [...dataIssues, ...mockIssues];

  if (!issues.length) {
    console.log("[data-audit] PASS");
    return;
  }

  console.error(`[data-audit] FAIL (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
  issues.forEach((issue) => {
    const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ""}` : "data-contract";
    console.error(`- ${location}: ${issue.message}`);
  });
  process.exit(1);
}

main().catch((error) => {
  console.error("[data-audit] ERROR", error);
  process.exit(1);
});
