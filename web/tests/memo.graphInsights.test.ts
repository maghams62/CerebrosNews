import assert from "node:assert/strict";
import test from "node:test";
import { generateFundMemo, generateWatchlistBrief } from "@/lib/fundgraph/memo";
import { markdownToEditorHtml } from "@/lib/fundgraph/memoEditor";
import { readFunds } from "@/lib/fundgraph/storage";

test("fund memo includes Graph Analyzer Insights when graph context is enabled", async () => {
  process.env.FUNDGRAPH_MEMO_USE_LLM = "0";
  const funds = await readFunds();
  assert.ok(funds.length > 0, "expected funds to exist");

  const memo = await generateFundMemo({
    fundId: funds[0]!.id,
    includeGraphContext: true,
    includeSignals: false,
    includeClaims: false,
  });

  assert.ok(
    memo.sections.some((section) => section.key === "graph_analyzer_insights"),
    "expected graph analyzer section in memo sections"
  );
  assert.match(memo.memoMarkdown, /## Graph Analyzer Insights/, "expected markdown heading for graph analyzer insights");
  const section = memo.sections.find((item) => item.key === "graph_analyzer_insights");
  assert.match(section?.content ?? "", /Relationship motifs:/, "expected relationship motifs in graph insights section");
  const graphSection = memo.sections.find((item) => item.key === "graph_snapshot");
  assert.ok(graphSection, "expected graph snapshot section in memo");
  assert.match(graphSection?.content ?? "", /data:image\/svg\+xml/i, "expected graph snapshot image data uri");
});

test("fund memo marks graph analyzer insights as excluded when graph context is off", async () => {
  process.env.FUNDGRAPH_MEMO_USE_LLM = "0";
  const funds = await readFunds();
  assert.ok(funds.length > 0, "expected funds to exist");

  const memo = await generateFundMemo({
    fundId: funds[0]!.id,
    includeGraphContext: false,
    includeSignals: false,
    includeClaims: false,
  });

  const section = memo.sections.find((item) => item.key === "graph_analyzer_insights");
  assert.ok(section, "expected graph analyzer section to exist with exclusion note");
  assert.match(section?.content ?? "", /excluded by memo options/i);
});

test("watchlist brief includes cross-fund network section when graph context is enabled", async () => {
  process.env.FUNDGRAPH_MEMO_USE_LLM = "0";
  const funds = await readFunds();
  assert.ok(funds.length >= 3, "expected at least three funds for watchlist");

  const brief = await generateWatchlistBrief({
    fundIds: [funds[0]!.id, funds[1]!.id, funds[2]!.id],
    includeGraphContext: true,
    includeSignals: false,
    includeClaims: false,
  });

  assert.ok(
    brief.sections.some((section) => section.key === "cross_fund_network_signals"),
    "expected cross-fund network section"
  );
  assert.ok(brief.sections.some((section) => section.key === "graph_snapshot"), "expected graph snapshot section");
  assert.match(brief.memoMarkdown, /## Shared Network Context/);
  assert.match(brief.memoMarkdown, /data:image\/svg\+xml/i, "expected watchlist memo to include graph snapshot image");

  const graphSection = brief.sections.find((section) => section.key === "graph_snapshot");
  assert.ok(graphSection, "expected graph snapshot section content");
  assert.match(graphSection.content, /%29/, "expected markdown-safe encoded parentheses in data URI");

  const graphHtml = markdownToEditorHtml(graphSection.content);
  assert.match(graphHtml, /<img[^>]+src="data:image\/svg\+xml/i, "expected graph snapshot markdown to render as image");
  assert.doesNotMatch(graphHtml, /\/>\s*%[0-9a-f]{2}/i, "expected no leaked encoded SVG tail text after image tag");

  const focusLine = graphSection.content
    .split("\n")
    .find((line) => line.trim().toLowerCase().startsWith("- focus funds:"));
  assert.ok(focusLine, "expected focus funds line in graph snapshot section");
  assert.match(focusLine ?? "", new RegExp(funds[0]!.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(focusLine ?? "", new RegExp(funds[1]!.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(focusLine ?? "", new RegExp(funds[2]!.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
