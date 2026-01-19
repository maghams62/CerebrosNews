import type { Story } from "@/types/story";
import type { StoryPerspective, PerspectiveLabel } from "@/types/storyPerspective";

function stableHash(s: string): number {
  // Tiny deterministic hash (not crypto) for repeatable mock selection.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

const DEFAULT_LABELS: PerspectiveLabel[] = ["Media", "Community", "Primary", "Skeptical"];

export function generateMockPerspectives(story: Omit<Story, "perspectives">): StoryPerspective[] {
  const seed = stableHash(story.id + "|" + story.title);
  const labels = DEFAULT_LABELS.slice(0, 4);

  const coveredByBase = [
    story.sourceName,
    pick(["AP", "Reuters", "Bloomberg", "The Verge", "FT", "Guardian"], seed + 1),
    pick(["Local wire", "Reddit thread", "Official blog", "Press release"], seed + 2),
    pick(["Analyst note", "Community post", "Primary doc", "Explainer"], seed + 3),
  ].filter(Boolean);

  const mk = (label: PerspectiveLabel, i: number): StoryPerspective => {
    const sourceName = (() => {
      if (label === "Primary") return "Primary source (mock)";
      if (label === "Community") return "Community (mock)";
      if (label === "Media") return "Media roundup (mock)";
      if (label === "Skeptical") return "Skeptical take (mock)";
      return "Optimistic take (mock)";
    })();

    const framingLine = (() => {
      if (label === "Media") return "Framing: what headlines emphasize vs. what they omit (placeholder).";
      if (label === "Community") return "Framing: what people are reacting to in forums (placeholder).";
      if (label === "Primary") return "Framing: what the source document actually says (placeholder).";
      if (label === "Skeptical") return "Framing: strongest caveats and missing details (placeholder).";
      return "Framing: best-case implications if claims hold (placeholder).";
    })();

    const tone = label === "Optimistic" ? "Optimistic" : label === "Skeptical" ? "Skeptical" : "Neutral";
    const stance = label === "Skeptical" ? "Skeptical" : label === "Optimistic" ? "Supportive" : "Neutral";

    const titleSuffix = i === 0 ? "" : ` (Alt ${i + 1})`;
    const summaryPrefix =
      label === "Primary"
        ? "Primary lens:"
        : label === "Community"
          ? "Community lens:"
          : label === "Media"
            ? "Media lens:"
            : label === "Skeptical"
              ? "Skeptical lens:"
              : "Optimistic lens:";

    const mkFacts = () => {
      const base = `${summaryPrefix} ${story.summary}`.replace(/\s+/g, " ").trim();
      return [
        base,
        "Key actors and incentives are not fully specified yet (placeholder).",
        "Primary docs or data are limited in early coverage (placeholder).",
        "Timelines and scope may still shift as reporting evolves (placeholder).",
      ].slice(0, 4);
    };

    const mkBias = () => [
      "Vested interest or ownership incentives are unclear (placeholder).",
      "Historical framing pattern favors speed over nuance (placeholder).",
      "Outlet A emphasizes upside; Outlet B emphasizes risk (placeholder).",
      "Confidence: Medium (mock).",
    ].slice(0, 4);

    const mkMissing = () => [
      "No cost breakdown provided (placeholder).",
      "No primary data or docs linked (placeholder).",
      "No dissenting expert quoted (placeholder).",
      "Implementation timeline unclear (placeholder).",
    ].slice(0, 4);

    const mkImpact = () => [
      "Who is affected: founders, engineers, and users (placeholder).",
      "Likely winners/losers remain uncertain (placeholder).",
      "Near-term impact is clearer than long-term implications (placeholder).",
      "Confidence: Medium (mock).",
    ].slice(0, 4);

    return {
      id: `${story.id}:${label.toLowerCase()}`,
      label,
      sourceName,
      title: `${story.title}${titleSuffix}`,
      url: story.url,
      summary: `${summaryPrefix} ${story.summary}`,
      framingLine,
      tone,
      stance,
      coveredBy: coveredByBase.slice(0, 3 + ((seed + i) % 2)), // 3–4 chips
      facts: mkFacts(),
      bias: mkBias(),
      missing: mkMissing(),
      impact: mkImpact(),
      publishedAt: story.publishedAt,
      statusBadge: "Confirmed",
      stanceBadges: [stance],
    };
  };

  return labels.map(mk);
}

