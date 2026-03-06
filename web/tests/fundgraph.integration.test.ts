import assert from "node:assert/strict";
import test from "node:test";
import { POST as postClaimSourceRoute } from "@/app/api/fundgraph/claims/[id]/sources/route";
import { GET as getClaimVerificationRoute } from "@/app/api/fundgraph/claims/[id]/verification/route";
import { extractClaimsFromStoredSource } from "@/lib/fundgraph/actions/extractClaims";
import { verifyClaimAction } from "@/lib/fundgraph/actions/verifyClaim";
import { buildClaimVerificationRecord } from "@/lib/fundgraph/verification";
import { getRecommendations } from "@/lib/fundgraph/service";
import { materializeSource } from "@/lib/fundgraph/ingestion";
import { generateAllocationMemo, generateWatchlistBrief } from "@/lib/fundgraph/memo";
import { applyContribution, getGamificationUser } from "@/lib/fundgraph/gamification";
import { readFunds } from "@/lib/fundgraph/storage";
import { addSource } from "@/lib/fundgraph/store.contract";
import { GET as getMemoRoute } from "@/app/api/fundgraph/memos/[id]/route";
import { PATCH as patchMemoRoute } from "@/app/api/fundgraph/memos/[id]/route";
import { POST as postMemoRoute } from "@/app/api/fundgraph/memo/route";
import { POST as postWatchlistBriefRoute } from "@/app/api/fundgraph/watchlist-brief/route";

test("fundgraph integration: ingest -> extract -> verify/dispute -> recommend -> memo", async () => {
  process.env.FUNDGRAPH_DATA_MODE = "hybrid";

  const source = await materializeSource({
    type: "PASTED_TEXT",
    title: "Integration test source",
    text: [
      "North Ventures 1 increased focus on AI infrastructure and enterprise software.",
      "Portfolio company Mercury launched a new product and reported stronger demand.",
      "Analysts noted mixed sentiment around the latest valuation update.",
    ].join(" "),
  });
  await addSource(source);

  const extracted = await extractClaimsFromStoredSource(source.id, true);
  assert.ok(!("error" in extracted), "expected source extraction to succeed");
  if ("error" in extracted) return;
  assert.ok(extracted.claims.length > 0, "expected extracted claims");

  const claimId = extracted.claims[0]!.id;
  const verify = await verifyClaimAction({
    claimId,
    userId: "integration-user-1",
    vote: "verify",
    note: "first pass verify",
  });
  assert.ok(!("error" in verify), "expected verify action to succeed");
  if ("error" in verify) return;
  assert.ok(verify.verifiedCount >= 1, "expected verified count to increment");
  assert.ok(verify.verificationRecord, "expected verification record in verify response");
  assert.ok((verify.verificationRecord?.score.finalScore ?? 0) >= 0, "expected final score");

  const dispute = await verifyClaimAction({
    claimId,
    userId: "integration-user-2",
    vote: "dispute",
    note: "counterpoint dispute",
  });
  assert.ok(!("error" in dispute), "expected dispute action to succeed");
  if ("error" in dispute) return;
  assert.ok(dispute.disputedCount >= 1, "expected disputed count to increment");
  assert.ok(dispute.verificationRecord, "expected verification record in dispute response");

  const recs = await getRecommendations(
    {
      userId: "integration-user-1",
      sectorFocus: ["AI"],
      stageFocus: ["Seed"],
      geographies: ["US"],
      geographyFocus: ["US"],
      riskTolerance: "medium",
      checkSizeMinM: 0.5,
      checkSizeMaxM: 10,
      typicalCheckSizeM: 2,
      typicalCheckSizeKUsd: 2000,
    },
    { limit: 2 }
  );
  assert.ok(recs.recommendations.length > 0, "expected recommendations");

  const topFundId = recs.recommendations[0]!.fund.id;
  const memo = await generateAllocationMemo({
    userId: "integration-user-1",
    fundIds: [topFundId],
  });
  assert.ok(memo.memoMarkdown.includes("# Investment Memo:"), "expected generated memo markdown");
  assert.ok(memo.sections.length >= 3, "expected memo sections");
});

test("verification scoring: tier weighting and dispute impact", () => {
  const claimId = `claim-${Date.now()}`;
  const commonMachine = {
    citationSupport: "MEDIUM" as const,
    sourceRelevance: "HIGH" as const,
    freshness: "RECENT" as const,
    conflictDetected: false,
    reasoningSummary: "Synthetic test machine output.",
    machineConfidence: 74,
  };
  const baseEvidence = [
    {
      id: `ev-${Date.now()}`,
      claimId,
      sourceType: "PUBLIC_ARTICLE" as const,
      visibility: "PUBLIC" as const,
      snippet: "Public source evidence.",
      submittedAt: new Date().toISOString(),
      confidence: "HIGH" as const,
    },
  ];

  const bronzeOnly = buildClaimVerificationRecord({
    claimId,
    machine: commonMachine,
    evidence: baseEvidence,
    votes: [
      {
        id: "vote-bronze",
        claimId,
        userId: "bronze-user",
        vote: "verify",
        contributor: { tier: "BRONZE", role: "MEMBER" },
        createdAt: new Date().toISOString(),
      },
    ],
  });
  const platinumOnly = buildClaimVerificationRecord({
    claimId,
    machine: commonMachine,
    evidence: baseEvidence,
    votes: [
      {
        id: "vote-platinum",
        claimId,
        userId: "platinum-user",
        vote: "verify",
        contributor: { tier: "PLATINUM", role: "MEMBER" },
        createdAt: new Date().toISOString(),
      },
    ],
  });
  assert.ok(
    platinumOnly.community.weightedVerifyScore > bronzeOnly.community.weightedVerifyScore,
    "expected platinum verify weight to exceed bronze verify weight"
  );

  const withGoldDispute = buildClaimVerificationRecord({
    claimId,
    machine: commonMachine,
    evidence: baseEvidence,
    votes: [
      {
        id: "vote-verify",
        claimId,
        userId: "verify-user",
        vote: "verify",
        contributor: { tier: "SILVER", role: "MEMBER" },
        createdAt: new Date().toISOString(),
      },
      {
        id: "vote-dispute",
        claimId,
        userId: "dispute-user",
        vote: "dispute",
        contributor: { tier: "GOLD", role: "ANALYST" },
        createdAt: new Date().toISOString(),
      },
    ],
  });
  assert.ok(
    withGoldDispute.score.finalScore < platinumOnly.score.finalScore,
    "expected gold dispute to lower the final confidence score"
  );
});

test("verification API smoke: GET record and POST source", async () => {
  process.env.FUNDGRAPH_DATA_MODE = "hybrid";
  const source = await materializeSource({
    type: "PASTED_TEXT",
    title: "Verification API test source",
    text: "North Ventures disclosed a portfolio update and growth signals in AI infrastructure.",
  });
  await addSource(source);
  const extracted = await extractClaimsFromStoredSource(source.id, true);
  assert.ok(!("error" in extracted), "expected source extraction to succeed");
  if ("error" in extracted) return;

  const claimId = extracted.claims[0]!.id;
  const verifyResult = await verifyClaimAction({
    claimId,
    userId: "verification-api-user",
    vote: "verify",
  });
  assert.ok(!("error" in verifyResult), "expected verify action to succeed");
  if ("error" in verifyResult) return;

  const getResponse = await getClaimVerificationRoute(new Request(`http://localhost/api/fundgraph/claims/${claimId}/verification`), {
    params: Promise.resolve({ id: claimId }),
  });
  assert.equal(getResponse.status, 200, "expected verification GET to succeed");
  const getPayload = (await getResponse.json()) as { claimId?: string; score?: { finalScore?: number } };
  assert.equal(getPayload.claimId, claimId, "expected claim id to match");
  assert.ok(typeof getPayload.score?.finalScore === "number", "expected final score in verification record");

  const postResponse = await postClaimSourceRoute(
    new Request(`http://localhost/api/fundgraph/claims/${claimId}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "PUBLIC_ARTICLE",
        visibility: "PUBLIC",
        title: "Test source",
        url: "https://example.com/verification-test",
        snippet: "Article snippet supports the core claim.",
        confidence: "HIGH",
      }),
    }),
    { params: Promise.resolve({ id: claimId }) }
  );
  assert.equal(postResponse.status, 200, "expected add-source POST to succeed");
  const postPayload = (await postResponse.json()) as { verificationRecord?: { evidence?: unknown[] } };
  assert.ok((postPayload.verificationRecord?.evidence?.length ?? 0) >= 1, "expected evidence trail after source add");
});

test("fundgraph memo API smoke: POST /memo then GET /memos/:id", async () => {
  process.env.FUNDGRAPH_DATA_MODE = "hybrid";

  const funds = await readFunds();
  assert.ok(funds.length > 0, "expected funds to exist");

  const userId = `integration-memo-${Date.now()}`;
  let snapshot = await getGamificationUser(userId);
  for (let attempt = 0; snapshot.credits < 2 && attempt < 3; attempt += 1) {
    snapshot = await applyContribution(userId, "verify_claim", `claim-${Date.now()}-${attempt}`);
  }
  assert.ok(snapshot.credits >= 2, "expected user credits to allow memo generation");

  const postResponse = await postMemoRoute(
    new Request("http://localhost/api/fundgraph/memo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, fundId: funds[0]!.id }),
    })
  );
  assert.equal(postResponse.status, 200, "expected memo POST to succeed");

  const postPayload = (await postResponse.json()) as {
    memoId?: string;
    memoMarkdown?: string;
    generationMode?: "llm" | "deterministic";
  };
  assert.ok(postPayload.memoId, "expected memoId in POST response");
  assert.ok(postPayload.memoMarkdown, "expected memoMarkdown in POST response");
  assert.ok(postPayload.generationMode, "expected generationMode in POST response");

  const getResponse = await getMemoRoute(new Request(`http://localhost/api/fundgraph/memos/${postPayload.memoId}`), {
    params: Promise.resolve({ id: String(postPayload.memoId) }),
  });
  assert.equal(getResponse.status, 200, "expected memo GET to succeed");

  const getPayload = (await getResponse.json()) as { memo?: { memoMarkdown?: string } };
  assert.ok(getPayload.memo?.memoMarkdown, "expected memoMarkdown in GET response");
});

test("watchlist brief generation defaults to 30d and includes Today Highlights", async () => {
  process.env.FUNDGRAPH_MEMO_USE_LLM = "0";
  const funds = await readFunds();
  assert.ok(funds.length >= 3, "expected at least 3 funds");

  const brief = await generateWatchlistBrief({
    userId: `integration-watchlist-defaults-${Date.now()}`,
    fundIds: [funds[0]!.id, funds[1]!.id, funds[2]!.id],
  });

  assert.equal(brief.options.timeWindow, "30d", "expected watchlist brief default time window to be 30d");
  assert.ok(brief.sections.some((section) => section.key === "today_highlights"), "expected today highlights section");
  assert.match(brief.memoMarkdown, /## Today Highlights/, "expected markdown to include Today Highlights heading");
  assert.equal(brief.generationMode, "deterministic", "expected deterministic mode in local test default");
});

test("watchlist brief API returns generation mode and today highlights", async () => {
  process.env.FUNDGRAPH_DATA_MODE = "hybrid";
  const funds = await readFunds();
  assert.ok(funds.length >= 3, "expected funds to exist");

  const userId = `integration-watchlist-${Date.now()}`;
  let snapshot = await getGamificationUser(userId);
  for (let attempt = 0; snapshot.credits < 2 && attempt < 3; attempt += 1) {
    snapshot = await applyContribution(userId, "verify_claim", `claim-watch-${Date.now()}-${attempt}`);
  }
  assert.ok(snapshot.credits >= 2, "expected user credits to allow watchlist brief generation");

  const postResponse = await postWatchlistBriefRoute(
    new Request("http://localhost/api/fundgraph/watchlist-brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        fundIds: [funds[0]!.id, funds[1]!.id, funds[2]!.id],
      }),
    })
  );
  assert.equal(postResponse.status, 200, "expected watchlist brief POST to succeed");

  const postPayload = (await postResponse.json()) as {
    memoId?: string;
    generationMode?: "llm" | "deterministic";
    sections?: Array<{ key?: string; title?: string; content?: string }>;
  };
  assert.ok(postPayload.memoId, "expected memoId in watchlist brief response");
  assert.ok(postPayload.generationMode, "expected generationMode in watchlist brief response");
  assert.ok(postPayload.sections?.some((section) => section.key === "today_highlights"), "expected today highlights section in response");
  assert.ok(postPayload.sections?.some((section) => section.key === "watchlist_ranking"), "expected research notes section key in response");
  assert.ok(postPayload.sections?.some((section) => section.key === "graph_snapshot"), "expected graph snapshot section in response");
  assert.ok(
    postPayload.sections?.some((section) => section.key === "cross_fund_network_signals"),
    "expected shared network context section in response"
  );

  const researchNotes = postPayload.sections?.find((section) => section.key === "watchlist_ranking");
  assert.match(researchNotes?.title ?? "", /research notes/i, "expected watchlist_ranking title to reflect research-notes framing");
  assert.doesNotMatch(researchNotes?.content ?? "", /\bscore\b/i, "expected research notes content to avoid score language");
  assert.doesNotMatch(researchNotes?.content ?? "", /\brank(?:ed|ing)?\b/i, "expected research notes content to avoid ranking language");
});

test("memo PATCH API validates payload, enforces owner, and saves edits", async () => {
  process.env.FUNDGRAPH_DATA_MODE = "hybrid";

  const funds = await readFunds();
  assert.ok(funds.length > 0, "expected funds to exist");

  const ownerId = `integration-memo-owner-${Date.now()}`;
  let ownerSnapshot = await getGamificationUser(ownerId);
  for (let attempt = 0; ownerSnapshot.credits < 2 && attempt < 3; attempt += 1) {
    ownerSnapshot = await applyContribution(ownerId, "verify_claim", `claim-owner-${Date.now()}-${attempt}`);
  }
  assert.ok(ownerSnapshot.credits >= 2, "expected owner credits to allow memo generation");

  const createResponse = await postMemoRoute(
    new Request("http://localhost/api/fundgraph/memo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: ownerId, fundId: funds[0]!.id }),
    })
  );
  assert.equal(createResponse.status, 200, "expected memo creation to succeed");
  const created = (await createResponse.json()) as { memoId?: string };
  assert.ok(created.memoId, "expected memo id from create response");

  const invalidResponse = await patchMemoRoute(
    new Request(`http://localhost/api/fundgraph/memos/${created.memoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id: String(created.memoId) }) }
  );
  assert.equal(invalidResponse.status, 400, "expected empty patch body to fail validation");

  const forbiddenResponse = await patchMemoRoute(
    new Request(`http://localhost/api/fundgraph/memos/${created.memoId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-fundgraph-user-id": "another-user",
      },
      body: JSON.stringify({ memoMarkdown: "# Not owner edit" }),
    }),
    { params: Promise.resolve({ id: String(created.memoId) }) }
  );
  assert.equal(forbiddenResponse.status, 403, "expected non-owner patch to be rejected");

  const missingResponse = await patchMemoRoute(
    new Request("http://localhost/api/fundgraph/memos/non-existent-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoMarkdown: "# Missing memo" }),
    }),
    { params: Promise.resolve({ id: "non-existent-id" }) }
  );
  assert.equal(missingResponse.status, 404, "expected patch on missing memo to return not found");

  const updateResponse = await patchMemoRoute(
    new Request(`http://localhost/api/fundgraph/memos/${created.memoId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-fundgraph-user-id": ownerId,
      },
      body: JSON.stringify({
        memoMarkdown: "# Edited memo\n\nUpdated by owner.",
        editorHtml: "<h1>Edited memo</h1><p>Updated by owner.</p>",
      }),
    }),
    { params: Promise.resolve({ id: String(created.memoId) }) }
  );
  assert.equal(updateResponse.status, 200, "expected owner patch to succeed");
  const updatePayload = (await updateResponse.json()) as {
    memo?: { memoMarkdown?: string; isEdited?: boolean; lastEditedAt?: string; editorHtml?: string };
  };
  assert.match(updatePayload.memo?.memoMarkdown ?? "", /Edited memo/, "expected patched markdown to be persisted");
  assert.equal(updatePayload.memo?.isEdited, true, "expected isEdited flag to be true");
  assert.ok(updatePayload.memo?.lastEditedAt, "expected lastEditedAt timestamp to be set");
  assert.match(updatePayload.memo?.editorHtml ?? "", /<h1>Edited memo/, "expected patched editor html to be persisted");
});
