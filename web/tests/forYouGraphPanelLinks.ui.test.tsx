import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EmergingOpportunitiesPanel } from "@/components/fundgraph/EmergingOpportunitiesPanel";
import { GraphEventsPanel } from "@/components/fundgraph/GraphEventsPanel";
import { GraphQuerySnapshotsPanel } from "@/components/fundgraph/GraphQuerySnapshotsPanel";

test("graph snapshots header CTA follows the top query href", () => {
  const html = renderToStaticMarkup(
    <GraphQuerySnapshotsPanel
      items={[
        {
          id: "snap-1",
          title: "Top snapshot",
          subtitle: "Candidate overlap pattern",
          sourceLabel: "Network",
          href: "/fundgraph/graph?q=companies%20Accel%20invested%20in",
          query: "companies Accel invested in",
        },
      ]}
    />
  );

  assert.match(html, /href=\"\/fundgraph\/graph\?q=companies%20Accel%20invested%20in\"/);
});

test("graph events header CTA follows the strongest event href", () => {
  const html = renderToStaticMarkup(
    <GraphEventsPanel
      items={[
        {
          id: "event-1",
          text: "Co-investment event",
          kind: "co-investment",
          href: "/fundgraph/graph?q=common%20investments%20between%20Accel%20and%20Benchmark",
          graphQuery: "common investments between Accel and Benchmark",
        },
      ]}
    />
  );

  assert.match(html, /href=\"\/fundgraph\/graph\?q=common%20investments%20between%20Accel%20and%20Benchmark\"/);
});

test("emerging opportunities header CTA follows the top bubble href", () => {
  const html = renderToStaticMarkup(
    <EmergingOpportunitiesPanel
      items={[
        {
          id: "opp-1",
          label: "AI infra",
          impactScore: 82,
          trendDelta: 6,
          supportCount: 12,
          contestedCount: 2,
          confidence: 0.74,
          x: 42,
          y: 66,
          size: 52,
          href: "/fundgraph/graph?q=funds%20investing%20in%20AI%20infrastructure",
          graphQuery: "funds investing in AI infrastructure",
        },
      ]}
    />
  );

  assert.match(html, /href=\"\/fundgraph\/graph\?q=funds%20investing%20in%20AI%20infrastructure\"/);
});
