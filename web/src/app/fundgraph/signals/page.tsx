import { SignalsFeed } from "@/components/fundgraph/SignalsFeed";
import { readFundgraphDb } from "@/lib/fundgraph/store";
import { readFunds } from "@/lib/fundgraph/storage";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function FundGraphSignalsPage() {
  const [funds, db] = await Promise.all([readFunds(), readFundgraphDb()]);
  const signals = [...(db.signals ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const nameById = Object.fromEntries(funds.map((fund) => [fund.id, fund.name]));
  const fundById = Object.fromEntries(funds.map((fund) => [fund.id, fund]));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
        <h1 className="text-xl font-semibold text-slate-900">Signals</h1>
        <p className="mt-1 text-sm text-slate-600">Structured community intelligence tied to funds.</p>
      </section>

      <SignalsFeed signals={signals} fundNameById={nameById} fundById={fundById} />
    </div>
  );
}
