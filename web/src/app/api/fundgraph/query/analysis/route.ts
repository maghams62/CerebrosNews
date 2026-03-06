import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeGraphQueryWithLlm } from "@/lib/fundgraph/llm";

export const runtime = "nodejs";

type ConfidenceBucket = "low" | "medium" | "high";

const graphAnalysisSchema = z.object({
  packet: z.object({
    preset: z.string().trim().min(1).max(120),
    query_label: z.string().trim().min(1).max(180),
    query_text: z.string().trim().max(700).optional(),
    query_intent: z
      .enum([
        "path",
        "funds_in_theme",
        "companies_linked",
        "companies_invested_by_fund",
        "founders_backed_by_fund",
        "companies_funded_by_both",
        "search",
      ])
      .optional(),
    display_mode: z.enum(["overview", "focus", "expanded"]).optional(),
    focus_entity: z
      .object({
        id: z.string().trim().min(1).max(180),
        name: z.string().trim().min(1).max(180),
        type: z.string().trim().min(1).max(64),
      })
      .optional(),
    result_summary: z.object({
      node_count: z.number().int().min(0).max(5000),
      edge_count: z.number().int().min(0).max(20_000),
      visible_nodes: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(180),
            name: z.string().trim().min(1).max(180),
            type: z.string().trim().min(1).max(64),
            degree: z.number().int().min(0).max(1000).optional(),
          })
        )
        .max(220),
      visible_edges: z
        .array(
          z.object({
            source: z.string().trim().min(1).max(180),
            target: z.string().trim().min(1).max(180),
            type: z.string().trim().min(1).max(64),
            cited: z.boolean(),
            citation_count: z.number().int().min(0).max(500).optional(),
          })
        )
        .max(360),
    }),
    query_paths: z
      .array(
        z.object({
          path_label: z.string().trim().min(1).max(180),
          steps: z
            .array(
              z.object({
                source: z.string().trim().min(1).max(180),
                edge_type: z.string().trim().min(1).max(64),
                target: z.string().trim().min(1).max(180),
                cited: z.boolean(),
              })
            )
            .max(16),
        })
      )
      .max(20),
    evidence_stats: z.object({
      cited_coverage_pct: z.number().min(0).max(100),
      verified_edges: z.number().int().min(0).max(50_000),
      unverified_edges: z.number().int().min(0).max(50_000),
      hidden_metric_slots: z.number().int().min(0).max(50_000).optional(),
    }),
    selected_node: z
      .object({
        name: z.string().trim().min(1).max(180),
        type: z.string().trim().min(1).max(64),
        cited_links: z.number().int().min(0).max(5000).optional(),
        top_connections: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(180),
              edge_type: z.string().trim().min(1).max(64),
              cited: z.boolean(),
            })
          )
          .max(20)
          .optional(),
      })
      .optional(),
    selected_edge: z
      .object({
        source: z.string().trim().min(1).max(180),
        target: z.string().trim().min(1).max(180),
        type: z.string().trim().min(1).max(64),
        cited: z.boolean(),
      })
      .optional(),
  }),
});

type GraphAnalysisPayload = z.infer<typeof graphAnalysisSchema>;
type GraphExplanationPacket = GraphAnalysisPayload["packet"];

function computeConfidenceBucket(stats: GraphExplanationPacket["evidence_stats"]): ConfidenceBucket {
  const coverage = Number.isFinite(stats.cited_coverage_pct) ? stats.cited_coverage_pct : 0;
  const totalEdges = Math.max(0, stats.verified_edges + stats.unverified_edges);
  const verifiedDensity = totalEdges > 0 ? stats.verified_edges / totalEdges : 0;

  if (coverage >= 70 && verifiedDensity >= 0.65) return "high";
  if (coverage < 30 || verifiedDensity < 0.35) return "low";
  return "medium";
}

function edgeTypeLabel(type: string): string {
  if (type === "INVESTED_IN") return "INVESTED_IN";
  if (type === "CO_INVESTED") return "CO_INVESTED";
  if (type === "FOUNDED") return "FOUNDED";
  if (type === "SUPPORTED_BY") return "SUPPORTED_BY";
  if (type === "CONTRADICTS") return "CONTRADICTS";
  return "MENTIONS";
}

function deterministicPathExplanations(packet: GraphExplanationPacket): string[] {
  const fromPaths = packet.query_paths
    .slice(0, 6)
    .flatMap((path) =>
      path.steps.slice(0, 3).map((step) => `${step.source} -> ${edgeTypeLabel(step.edge_type)} -> ${step.target}${step.cited ? "" : " (uncited)"}`)
    );

  if (fromPaths.length) return fromPaths;

  return packet.result_summary.visible_edges
    .slice(0, 4)
    .map((edge) => `${edge.source} -> ${edgeTypeLabel(edge.type)} -> ${edge.target}${edge.cited ? "" : " (uncited)"}`);
}

function deterministicAnswer(packet: GraphExplanationPacket, confidence: ConfidenceBucket): string {
  const focus = packet.focus_entity?.name || packet.selected_node?.name || "the selected focus";
  const companyCount = packet.result_summary.visible_nodes.filter((node) => node.type === "company").length;
  const fundCount = packet.result_summary.visible_nodes.filter((node) => node.type === "fund").length;
  const pathCount = packet.query_paths.length;

  if (packet.query_intent === "path") {
    const hopCount = packet.query_paths[0]?.steps.length ?? 0;
    return `The graph currently shows a ${hopCount}-hop path for this query with ${packet.evidence_stats.verified_edges} verified edge(s) and ${packet.evidence_stats.unverified_edges} unverified candidate edge(s). Confidence is ${confidence} because citation support is ${Math.round(packet.evidence_stats.cited_coverage_pct)}%.`;
  }

  if (packet.query_intent === "companies_invested_by_fund") {
    return `${focus} is connected to ${companyCount} companies in this result through visible investment-style links. ${packet.evidence_stats.verified_edges} of ${Math.max(1, packet.evidence_stats.verified_edges + packet.evidence_stats.unverified_edges)} key edges are citation-backed, so use this as ${confidence === "high" ? "a high-confidence read" : "an exploratory view"}.`;
  }

  if (packet.query_intent === "companies_funded_by_both") {
    return `This overlap query returns ${companyCount} visible companies and ${fundCount} funds in the active subgraph. ${packet.evidence_stats.verified_edges} shared-link edge(s) are currently verified, so the overlap signal should be treated as ${confidence === "high" ? "confirmed" : "directional"}.`;
  }

  if (packet.query_intent === "funds_in_theme") {
    return `This theme result surfaces ${fundCount} fund nodes connected through ${packet.result_summary.edge_count} visible relationships. Evidence coverage is ${Math.round(packet.evidence_stats.cited_coverage_pct)}%, so confidence is ${confidence}.`;
  }

  if (packet.query_intent === "companies_linked") {
    return `${focus} is connected to ${companyCount} company node(s) in this view via ${packet.result_summary.edge_count} visible edges. Citation support is mixed (${Math.round(packet.evidence_stats.cited_coverage_pct)}% coverage), so treat uncited links as candidates until verified.`;
  }

  return `This query currently returns ${packet.result_summary.node_count} nodes and ${packet.result_summary.edge_count} edges with ${packet.evidence_stats.verified_edges} verified edge(s). Evidence coverage is ${Math.round(packet.evidence_stats.cited_coverage_pct)}%, so confidence is ${confidence}.`;
}

function deterministicDerivationSummary(packet: GraphExplanationPacket): string {
  const focus = packet.focus_entity?.name || packet.selected_node?.name || "the query anchor";
  return `The result was derived from the visible neighborhood around ${focus}, using the currently filtered nodes and edges in ${packet.display_mode ?? "overview"} mode. Path summaries come from highlighted query paths and visible edge connections in this snapshot.`;
}

function deterministicTakeaways(packet: GraphExplanationPacket, confidence: ConfidenceBucket): string[] {
  const takeaways: string[] = [];
  if (confidence === "low") {
    takeaways.push("The structure is useful for exploration, but evidence coverage is too sparse for strong factual claims.");
  } else if (confidence === "high") {
    takeaways.push("Most visible relationships are citation-backed, so this result is suitable for high-confidence interpretation.");
  } else {
    takeaways.push("The graph has mixed verification, so conclusions should separate confirmed links from candidate links.");
  }

  if (packet.query_paths.length > 0) {
    takeaways.push("The main interpretation is driven by a small set of highlighted paths; verify each path edge before memo use.");
  }

  if (packet.evidence_stats.unverified_edges > packet.evidence_stats.verified_edges) {
    takeaways.push("Unverified candidate edges outnumber verified edges in this result.");
  }

  return takeaways.slice(0, 4);
}

function deterministicNextActions(packet: GraphExplanationPacket, confidence: ConfidenceBucket): string[] {
  const focus = packet.focus_entity?.name || packet.selected_node?.name || "this focus";

  if (packet.query_intent === "path") {
    return [
      "Expand neighborhood to inspect alternate routes between the same endpoints.",
      "Show only verified edges to test whether the path still holds.",
      `Run a co-investor query for ${focus} to inspect overlap drivers around this path.`,
    ];
  }

  if (packet.query_intent === "companies_invested_by_fund") {
    return [
      `Run \"co-investors of ${focus}\" to test for syndicate structure around this portfolio.`,
      "Show only verified edges before using this as an investment fact set.",
      "Expand neighborhood to compare second-order fund links around top companies.",
    ];
  }

  if (packet.query_intent === "companies_funded_by_both") {
    return [
      "Show only verified edges to confirm shared-company overlap.",
      "Open a path query between one shared company and each fund to inspect bridge quality.",
      "Expand neighborhood to compare alternate overlap routes.",
    ];
  }

  if (confidence === "low") {
    return [
      "Attach citations to key uncited edges before drawing conclusions.",
      "Show only verified edges to separate confirmed structure from candidates.",
      "Run the same query after verification to check whether the narrative changes.",
    ];
  }

  return [
    "Expand neighborhood to expose second-order links around the current answer.",
    "Run a co-investor query from the current focus to test overlap behavior.",
    "Open a path query between the strongest connected entities for bridge analysis.",
  ];
}

function fallbackNarrative(packet: GraphExplanationPacket) {
  const confidenceBucket = computeConfidenceBucket(packet.evidence_stats);
  return {
    mode: "fallback" as const,
    answer: deterministicAnswer(packet, confidenceBucket),
    derivationSummary: deterministicDerivationSummary(packet),
    pathExplanations: deterministicPathExplanations(packet),
    evidenceQuality: {
      answerConfidence: confidenceBucket,
      explanation:
        confidenceBucket === "high"
          ? "Citation coverage and verification density are strong in this result."
          : confidenceBucket === "medium"
            ? "Evidence quality is mixed; separate verified links from candidate links."
            : "Coverage is sparse or mostly unverified, so treat this result as exploratory.",
      verifiedEdges: packet.evidence_stats.verified_edges,
      unverifiedEdges: packet.evidence_stats.unverified_edges,
      citationCoveragePct: Math.round(packet.evidence_stats.cited_coverage_pct),
    },
    keyTakeaways: deterministicTakeaways(packet, confidenceBucket),
    nextActions: deterministicNextActions(packet, confidenceBucket),
  };
}

export async function POST(req: Request) {
  const parsed = graphAnalysisSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const confidenceBucket = computeConfidenceBucket(payload.packet.evidence_stats);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(fallbackNarrative(payload.packet));
  }

  try {
    const result = await analyzeGraphQueryWithLlm({
      packet: payload.packet as Record<string, unknown>,
      confidenceBucket,
    });

    return NextResponse.json({
      mode: "llm",
      answer: result.answer,
      derivationSummary: result.derivation_summary,
      pathExplanations: result.path_explanations,
      evidenceQuality: {
        answerConfidence: confidenceBucket,
        explanation: result.evidence_quality.explanation,
        verifiedEdges: payload.packet.evidence_stats.verified_edges,
        unverifiedEdges: payload.packet.evidence_stats.unverified_edges,
        citationCoveragePct: Math.round(payload.packet.evidence_stats.cited_coverage_pct),
      },
      keyTakeaways: result.key_takeaways,
      nextActions: result.next_actions.length ? result.next_actions : deterministicNextActions(payload.packet, confidenceBucket),
    });
  } catch {
    return NextResponse.json(fallbackNarrative(payload.packet));
  }
}
