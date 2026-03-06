import Link from "next/link";
import { getClaims, getSignals } from "@/lib/fundgraph/store";
import { readFunds } from "@/lib/fundgraph/storage";

const NARRATIVE_BY_SLUG: Record<string, { title: string; keywords: string[]; description: string }> = {
  "ai-agents-workflow-replacement": {
    title: "AI Agents -> workflow replacement",
    keywords: ["agent", "automation", "workflow", "assistant"],
    description: "Signals where teams shift from manual execution to agent-led workflows.",
  },
  "model-eval-infrastructure": {
    title: "Model eval infrastructure",
    keywords: ["eval", "benchmark", "testing", "quality"],
    description: "Coverage around reliability tooling, eval pipelines, and production checks.",
  },
  "inference-cost-optimization": {
    title: "Inference cost optimization",
    keywords: ["inference", "cost", "efficiency", "token", "gpu"],
    description: "Signals focused on lower inference cost and better serving efficiency.",
  },
  "security-governance-layer": {
    title: "Security and governance layer",
    keywords: ["security", "governance", "compliance", "identity"],
    description: "Signals emphasizing trust, policy controls, and enterprise safeguards.",
  },
  "vertical-ai-expansion": {
    title: "Vertical AI expansion",
    keywords: ["vertical", "health", "legal", "fintech", "enterprise ai"],
    description: "Signals showing specialized AI adoption in domain workflows.",
  },
  "developer-tooling-reacceleration": {
    title: "Developer tooling reacceleration",
    keywords: ["developer", "devtools", "api", "platform", "integration"],
    description: "Signals tied to dev productivity and tooling stack momentum.",
  },
};

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.58) return "Medium";
  return "Low";
}

export default async function NarrativeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const narrative = NARRATIVE_BY_SLUG[slug];

  if (!narrative) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Narrative not found</h1>
          <p className="mt-2 text-sm text-slate-600">This narrative slug does not exist in the current catalog.</p>
          <Link
            href="/cerebrosfund"
            className="mt-4 inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to For You
          </Link>
        </section>
      </div>
    );
  }

  const [signals, claims, funds] = await Promise.all([getSignals(), getClaims(), readFunds()]);
  const fundNameById = new Map(funds.map((fund) => [fund.id, fund.name]));
  const fundIdByName = new Map(funds.map((fund) => [normalize(fund.name), fund.id]));

  const matchedSignals = signals
    .filter((signal) => {
      const text = normalize(`${signal.title} ${signal.summary} ${(signal.tags ?? []).join(" ")}`);
      return narrative.keywords.some((keyword) => text.includes(keyword));
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);

  const matchedClaims = claims
    .filter((claim) => {
      const text = normalize(`${claim.claimText} ${claim.category}`);
      return narrative.keywords.some((keyword) => text.includes(keyword));
    })
    .slice(0, 10);

  const graphFundId =
    matchedSignals[0]?.fundId ||
    matchedClaims.flatMap((claim) => claim.linkedFundIds).find((fundId) => fundNameById.has(fundId)) ||
    fundIdByName.get(normalize(narrative.title.split("->")[0] ?? ""));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Narrative</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{narrative.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{narrative.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {matchedSignals.length} supporting signals
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {matchedClaims.length} related claims
          </span>
          {graphFundId ? (
            <Link
              href={`/cerebrosfund/graph?fundId=${encodeURIComponent(graphFundId)}`}
              className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open graph context
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Top signals</h2>
          <div className="mt-3 space-y-3">
            {matchedSignals.length ? (
              matchedSignals.map((signal) => (
                <div key={signal.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{signal.title}</p>
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">
                      {confidenceLabel(signal.confidence)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">{signal.summary}</p>
                  <div className="mt-2 text-[11px] font-medium text-slate-500">{fundNameById.get(signal.fundId) ?? signal.fundId}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">No signals matched this narrative yet.</p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Evidence claims</h2>
          <div className="mt-3 space-y-3">
            {matchedClaims.length ? (
              matchedClaims.map((claim) => (
                <Link
                  key={claim.id}
                  href={`/cerebrosfund/graph?claimId=${encodeURIComponent(claim.id)}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:bg-white"
                >
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{claim.claimText}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">“{claim.citation.snippet}”</p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-600">No claims matched this narrative yet.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
