import { CreditsHowItWorksCard } from "@/components/fundgraph/CreditsHowItWorksCard";

export default function FundGraphCreditsPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-sm">
        <h1 className="text-xl font-semibold">How Credits Work</h1>
        <p className="mt-1 text-sm text-slate-200">Earn intelligence tokens by contributing signals, verifications, and sources.</p>
      </section>
      <CreditsHowItWorksCard showLearnMore={false} />
    </div>
  );
}
