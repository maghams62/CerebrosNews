import { FundsExplorerClient } from "@/components/fundgraph/FundsExplorerClient";
import { sanitizeFundForDisplay } from "@/lib/fundgraph/quality";
import { readFunds } from "@/lib/fundgraph/storage";

export default async function FundGraphFundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const funds = (await readFunds()).map(sanitizeFundForDisplay);

  return <FundsExplorerClient funds={funds} initialQuery={params.q ?? ""} />;
}
