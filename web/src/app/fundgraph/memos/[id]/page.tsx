import { MemoViewer } from "@/components/fundgraph/MemoViewer";

export default async function FundGraphMemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <MemoViewer memoId={id} />;
}
