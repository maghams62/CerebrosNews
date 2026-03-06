import { GraphAnalyzerNodeType, GraphPresetDefinition } from "@/components/fundgraph/graphAnalyzer/types";

export const GRAPH_ANALYZER_PRESETS: GraphPresetDefinition[] = [
  {
    id: "CO_INVESTMENT",
    title: "Co-Investment Network",
    description: "Reveal syndicates by mapping funds that repeatedly share portfolio companies.",
    nodeTypes: ["fund", "company"],
    edgeTypes: ["INVESTED_IN", "CO_INVESTED"],
    defaultFocusType: "fund",
    defaultHopDepth: 2,
    layoutConfig: {
      linkDistance: 130,
      chargeStrength: -300,
      cooldownTicks: 180,
    },
  },
  {
    id: "FOUNDER_NETWORK",
    title: "Founder-Investor Network",
    description: "Trace how people connect companies and investors.",
    nodeTypes: ["person", "company", "fund"],
    edgeTypes: ["FOUNDED", "INVESTED_IN"],
    defaultFocusType: "person",
    defaultHopDepth: 2,
    layoutConfig: {
      linkDistance: 140,
      chargeStrength: -320,
      cooldownTicks: 180,
    },
  },
  {
    id: "THEME_MAP",
    title: "Theme Map",
    description: "Map narrative themes to signals, companies, and the investors following them.",
    nodeTypes: ["theme", "signal", "company", "fund", "source"],
    edgeTypes: ["MENTIONS", "SUPPORTED_BY", "INVESTED_IN", "CONTRADICTS"],
    defaultFocusType: "theme",
    defaultHopDepth: 2,
    layoutConfig: {
      linkDistance: 120,
      chargeStrength: -280,
      cooldownTicks: 190,
    },
  },
  {
    id: "PORTFOLIO_OVERLAP",
    title: "Portfolio Overlap",
    description: "Compare two funds and isolate shared bets.",
    nodeTypes: ["fund", "company"],
    edgeTypes: ["INVESTED_IN", "CO_INVESTED"],
    defaultFocusType: "fund",
    defaultHopDepth: 1,
    layoutConfig: {
      linkDistance: 150,
      chargeStrength: -340,
      cooldownTicks: 170,
    },
  },
  {
    id: "SIGNAL_DIFFUSION",
    title: "Signal Diffusion",
    description: "Track how signals spread through companies, funds, and adjacent portfolios.",
    nodeTypes: ["signal", "company", "fund", "source"],
    edgeTypes: ["MENTIONS", "SUPPORTED_BY", "INVESTED_IN", "CO_INVESTED", "CONTRADICTS"],
    defaultFocusType: "signal",
    defaultHopDepth: 3,
    layoutConfig: {
      linkDistance: 128,
      chargeStrength: -290,
      cooldownTicks: 200,
    },
  },
];

export const DEFAULT_ENTITY_TYPE_ENABLED: Record<GraphAnalyzerNodeType, boolean> = {
  fund: true,
  company: true,
  person: true,
  claim: false,
  source: true,
  signal: true,
  theme: true,
};

export function getPresetById(id: string | null | undefined): GraphPresetDefinition | undefined {
  return GRAPH_ANALYZER_PRESETS.find((preset) => preset.id === id);
}
