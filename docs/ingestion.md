# FundGraph Ingestion

## Source Model

FundGraph stores all ingested inputs as `Source`:

```ts
Source {
  id: string;
  type: "NEWS_ARTICLE" | "PASTED_TEXT" | "URL" | "TWEET_THREAD_TEXT" | "PDF_TEXT" | "CSV_FUNDS";
  title: string;
  url?: string;
  rawText: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
```

## Supported Modalities (MVP)

- `NEWS_ARTICLE`: resolves from existing Cerebros dataset by `newsId` or URL when available.
- `PASTED_TEXT`: direct user text.
- `URL`: URL metadata now; text can be provided directly for extraction.
- `TWEET_THREAD_TEXT`: pasted thread text.
- `PDF_TEXT`: pasted extracted PDF text.
- `CSV_FUNDS`: pasted/uploaded CSV text (stored with parsed row metadata).

## API

- `POST /api/fundgraph/ingest`
  - Input: `{ type, title?, url?, text?, file?, newsId?, metadata? }`
  - Output: `{ sourceId, source }`

- `POST /api/fundgraph/extract_claims_from_source`
  - Input: `{ sourceId, force? }`
  - Output: `{ source, claims[] }` with citations and links.

- Existing compatibility wrapper:
  - `POST /api/fundgraph/extract_claims`
  - Accepts legacy article payload and now persists a `Source` before claim extraction.

## Claim Extraction Flow

1. Resolve source content.
2. Run LLM extraction in `hybrid|real` mode, heuristic fallback otherwise.
3. Normalize claims and citations.
4. Entity-link claims to fund entities.
5. Persist claims and claim links in store.

## Entity Linking

`ClaimLink` is stored per claim:

```ts
ClaimLink {
  claimId;
  targetType: "FUND" | "COMPANY" | "GP";
  targetId;
  targetName;
  score;
  matchedText?;
}
```

Matching strategy:

- dictionary from synthetic fund universe (`fund.name`, GP names, portfolio company names)
- exact/contains normalized match first
- fuzzy fallback (Dice coefficient on bigrams)
- thresholded scoring, top links retained

API:

- `GET /api/fundgraph/claims/:id/links`

## Notes

- Store extensions are backward-compatible (`sources`, `claimLinks`, `memos` are optional with defaults).
- Current `URL` and `PDF_TEXT` ingestion is text-driven MVP (no remote crawl/PDF parser job yet).
