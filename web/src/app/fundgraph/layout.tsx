import { FocusedViewerFrame } from "@/components/FocusedViewerFrame";
import { FundGraphShell } from "@/components/fundgraph/FundGraphShell";
import { FundGraphProvider } from "@/fundgraph/state";
import { getFundgraphDataMode } from "@/lib/fundgraph/config";
import { readFunds } from "@/lib/fundgraph/storage";

export const revalidate = 300;
export const runtime = "nodejs";

export default async function FundGraphLayout({ children }: { children: React.ReactNode }) {
  const funds = await readFunds();
  const mode = getFundgraphDataMode();

  return (
    <FocusedViewerFrame className="w-[min(1320px,94vw)] h-[min(920px,94vh)]">
      <FundGraphProvider>
        <FundGraphShell mode={mode} fundOptions={funds.slice(0, 80).map((fund) => ({ id: fund.id, name: fund.name }))}>
          {children}
        </FundGraphShell>
      </FundGraphProvider>
    </FocusedViewerFrame>
  );
}
