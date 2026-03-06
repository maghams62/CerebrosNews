import Link from "next/link";
import { ClaimsFeed } from "@/components/fundgraph/ClaimsFeed";
import { extractAndStoreClaimsFromSource } from "@/lib/fundgraph/claimProcessing";
import { filterClaimsForDemoMode } from "@/lib/fundgraph/demoModeFilter";
import { getNewsSourceById } from "@/lib/fundgraph/newsSource";
import { getClaims } from "@/lib/fundgraph/store";

export default async function FundGraphClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ fromArticle?: string }>;
}) {
  const params = await searchParams;
  let extractedCount = 0;

  if (params.fromArticle) {
    const existing = (await filterClaimsForDemoMode(await getClaims())).filter(
      (claim) => claim.sourceId === params.fromArticle
    );
    if (existing.length) {
      extractedCount = existing.length;
    } else {
      const source = await getNewsSourceById(params.fromArticle);
      if (source) {
        const extracted = await extractAndStoreClaimsFromSource(source);
        extractedCount = extracted.claims.length;
      }
    }
  }

  const claims = await filterClaimsForDemoMode(await getClaims());

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h1 className="text-xl font-semibold text-slate-900">News Claims</h1>
        <p className="mt-1 text-sm text-slate-600">
          Atomic claims with citation snippets and verification controls.
        </p>
        {params.fromArticle ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Extracted {extractedCount} claims from selected article.
          </div>
        ) : null}
        <div className="mt-3">
          <Link href="/feed" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
            Open feed to extract claims from another article →
          </Link>
        </div>
      </section>

      <ClaimsFeed claims={claims} defaultSourceId={params.fromArticle} />
    </div>
  );
}
