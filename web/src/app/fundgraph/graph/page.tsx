import { GraphAnalyzerPage } from "@/components/fundgraph/graphAnalyzer/GraphAnalyzerPage";

export default async function FundGraphGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ fundId?: string; slug?: string; claimId?: string; q?: string }>;
}) {
  const params = await searchParams;

  return (
    <GraphAnalyzerPage
      fundId={params.fundId}
      slug={params.slug}
      claimId={params.claimId}
      initialQuery={params.q}
    />
  );
}
