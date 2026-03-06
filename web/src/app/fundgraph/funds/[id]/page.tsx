import { notFound } from "next/navigation";
import { FundDetailClient } from "@/components/fundgraph/FundDetailClient";
import { sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { readFunds } from "@/lib/fundgraph/storage";

export default async function FundGraphFundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const funds = await readFunds();
  const fund = funds.find((entry) => entry.id === id || entry.slug === id);

  if (!fund) return notFound();

  return <FundDetailClient fund={sanitizeFundForDisplay(fund)} seedSignals={[]} />;
}
