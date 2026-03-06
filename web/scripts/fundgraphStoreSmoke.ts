import { createId } from "@/lib/fundgraph/ids";
import {
  addMemo,
  addSource,
  getLinksForClaim,
  getMemoById,
  getSourceById,
  setClaimLinks,
} from "@/lib/fundgraph/store.contract";
import { ClaimLink, Memo, Source } from "@/lib/fundgraph/types";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const source: Source = {
    id: createId("fg-source-smoke"),
    type: "PASTED_TEXT",
    title: "Smoke Source",
    rawText: "FundGraph smoke test source text for ingestion and persistence.",
    createdAt: new Date().toISOString(),
    metadata: { smoke: true },
  };

  await addSource(source);
  const loadedSource = await getSourceById(source.id);
  assert(loadedSource?.id === source.id, "source roundtrip failed");

  const claimId = createId("fg-claim-smoke");
  const links: ClaimLink[] = [
    {
      id: createId("fg-link-smoke"),
      claimId,
      targetType: "FUND",
      targetId: "fund-smoke-1",
      targetName: "Smoke Fund",
      score: 0.95,
      createdAt: new Date().toISOString(),
    },
  ];

  await setClaimLinks(claimId, links);
  const loadedLinks = await getLinksForClaim(claimId);
  assert(loadedLinks.length === 1 && loadedLinks[0].targetId === "fund-smoke-1", "claim link roundtrip failed");

  const memo: Memo = {
    id: createId("fg-memo-smoke"),
    userId: "smoke-user",
    fundIds: ["fund-smoke-1"],
    memoMarkdown: "# Smoke Memo\n\nMemo body.",
    sections: [
      {
        key: "overview",
        title: "Overview",
        content: "Smoke overview.",
      },
    ],
    citations: [],
    createdAt: new Date().toISOString(),
  };

  await addMemo(memo);
  const loadedMemo = await getMemoById(memo.id);
  assert(loadedMemo?.id === memo.id, "memo roundtrip failed");

  console.log("fundgraph store smoke test passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
