# Investment Memo System (FundGraph V1)

## Product Job
A memo is a **decision artifact**.
It answers: **Should I spend more diligence time on this opportunity, and why?**

## V1 Subject Model
- Primary artifact: **single-fund memo**
- Supporting inputs: signals, claims, graph context, portfolio context, community verification
- Multi-fund output is a separate artifact: **watchlist brief**

## Endpoints

### `POST /api/fundgraph/memo`
Generate a memo anchored on one fund.

Request body:
- `userId?: string`
- `fundId: string` (canonical)
- `fundIds?: string[]` (legacy compatibility; first ID is used)
- `memoType?: "quick_brief" | "investment_memo" | "deep_diligence"`
- `includeSignals?: boolean`
- `includeClaims?: boolean`
- `includePortfolio?: boolean`
- `includeGraphContext?: boolean`
- `includeCommunityDiscussion?: boolean`
- `timeWindow?: "30d" | "90d" | "all_time"`

Response includes:
- `memoId`
- `memoMarkdown`
- `artifactType` (`fund_memo`)
- `primaryFundId`
- `options`
- `sections[]`
- `citations[]`

### `POST /api/fundgraph/watchlist-brief`
Generate a separate multi-fund brief.

Request body:
- `userId?: string`
- `fundIds: string[]` (2-12)
- same option fields as `/memo`

Response includes:
- `memoId`
- `memoMarkdown`
- `artifactType` (`watchlist_brief`)
- `fundIds[]`
- `sections[]`
- `citations[]`

### `GET /api/fundgraph/memos/:id`
Returns persisted memo record.

## Fund Memo Sections (Default)
1. Executive Summary
2. Fund Overview
3. Team / GP Assessment
4. Strategy
5. Portfolio Snapshot
6. Key Signals & Recent Activity
7. Network Position
8. Bull Case
9. Risks / Concerns
10. Open Questions / What to Verify Next
11. Final View

## Storage
Memos are stored in the FundGraph DB with:
- `artifactType` (`fund_memo` or `watchlist_brief`)
- `memoType`
- `primaryFundId`
- `fundIds[]`
- `options`
- `memoMarkdown`
- `sections[]`
- `citations[]`
- `createdAt`

## Guardrails
- Missing data is explicitly marked as unknown/data-gap.
- Citations are attached for claims/signals used in synthesis.
- Duplicate evidence rows are deduplicated by content signature (title/summary/source/snippet for signals, claim/citation for claims).
- Fund memos include all unique signals/claims in the selected window for citation coverage; section bodies may show the top subset for readability.
- Time window and include-flags control what evidence enters the memo.
- Standard memo generation is always single-fund; multi-fund requires watchlist brief endpoint.

## Optional LLM Synthesis Prompt
- Prompt template: `packages/llm/prompts/fundgraph/generate_fund_memo.prompt`
- Runtime path: deterministic memo builder is default; LLM synthesis is optional fallback-safe.
- To enable LLM synthesis:
  - Set `OPENAI_API_KEY`
  - Set `FUNDGRAPH_MEMO_USE_LLM=1`
