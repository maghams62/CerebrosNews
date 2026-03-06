# CerebroNews

This repository contains the CerebroNews web app (Next.js) plus dataset utilities used for building and enriching the feed.

## Components at a Glance

- ENV (keys): `.env`
  - OpenAI key for the ask flow: `OPENAI_API_KEY`.
- Data scripts (build/enrich): `scripts/`
  - Dataset builder, tagging, trust fields backfill, and story group curation.

## Index
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API](#api)
- [CerebrosFund](#fundgraph)
- [AI Tools Used](#ai-tools-used)
- [What I'd Build with More Time](#what-id-build-with-more-time)
- [Data and Scripts](#data-and-scripts)
- [Notes](#notes)

## Prerequisites

- Node.js 18+ (or 20+)
- npm

## Setup

Create a `.env` file in `web/` and add your OpenAI key:

```env
OPENAI_API_KEY=sk-your-openai-api-key
```

## Quick Start

```bash
cd web
npm install
npm run dev:onboarding
```

Open http://localhost:3000 in your browser.

## Environment Variables

Example `.env`:

```env
OPENAI_API_KEY=sk-your-openai-api-key
FUNDGRAPH_DATA_MODE=hybrid
```

- `OPENAI_API_KEY`: Enables the ask flow in the feed UI.
- `FUNDGRAPH_DATA_MODE`: `mock|hybrid|real` (default `hybrid`) for CerebrosFund data mode.

## API

- POST `/api/ask`
  - Body: `{ "question": "...", "context": "...", "summary": "..." }`
  - Returns: `{ "answer": "...", "sources": [...] }`

## CerebrosFund

CerebrosFund is a new module under `/cerebrosfund` that demonstrates:
- Structured intelligence objects (funds, signals, claims, profile preferences)
- Citation-first claims (snippet + title + source URL)
- Verification UX (LLM verify button + community verify/disagree)
- Personalization (LP profile driven recommendations)
- Contribution loop (Cred + badge for posting/verifying)

Trust layer implementation details are documented in `docs/trust.md`.

### Feature flag

Set in `web/.env`:

```env
FUNDGRAPH_DATA_MODE=hybrid
```

Values:
- `mock`: synthetic claims + synthetic funds/signals
- `hybrid` (default): real news-derived claims + synthetic funds/signals
- `real`: reserved for full real-data backend wiring

### Routes

- `/cerebrosfund` dashboard (trending funds, recent signals, recent claims, recommendations)
- `/cerebrosfund/funds` fund directory with search + filters
- `/cerebrosfund/funds/[id]` fund profile with tabs (Overview, Portfolio, Signals, Graph)
- `/cerebrosfund/graph` standalone venture intelligence graph (interactive network)
- `/cerebrosfund/signals` signal feed
- `/cerebrosfund/claims` claims feed with category filtering and verify controls
- `/cerebrosfund/profile` LP preference form + recommendation preview

### Extract claims from article

Open any article at `/article/[id]` and click **Extract Claims**.  
This routes to `/cerebrosfund/claims?fromArticle=...` and displays extracted atomic claims with citation snippets.

### Cred loop

- Post signal: `+1` cred
- Verify/disagree on claim (first vote per claim): `+1` cred
- Mark your own signal community-verified: `+2` cred

Header shows `Cred` and badge tier (`New`, `Contributor`, `Verifier`, `Steward`).

### Demo script

1. Open `/cerebrosfund`
2. Review trending funds + recent signals + claims
3. Open `/article/<id>` and click **Extract Claims**
4. Verify one claim from `/cerebrosfund/claims`
5. Open `/cerebrosfund/profile` and change preferences
6. Return to dashboard and confirm recommendations changed
7. Use `+ Add Intelligence` to post a signal; verify it appears in signals feed

### CerebrosFund API

- POST `/api/fundgraph/extract_claims`
  - Body: `{ newsId }` or `{ title, url, content|summary }`
  - Returns extracted atomic claims with citations (verbatim snippet + source metadata).
- POST `/api/fundgraph/verify_claim`
  - Body: `{ claimId, userId?, vote?: \"verify\"|\"disagree\", comment? }`
  - Runs LLM verification and records community vote/trust updates.
- POST `/api/fundgraph/claims/[id]/verify`
  - Body: `{ userId, vote: \"verify\"|\"dispute\", note? }`
  - Records community verification/dispute and returns updated trust fields.
- GET `/api/fundgraph/claims`
  - Query: `limit`, `category`, `sourceId`
- GET `/api/fundgraph/claims/[id]/conflicts`
  - Returns open conflicts for a claim.
- GET `/api/fundgraph/funds`
  - Query: `q|search`, `sector`, `stage`, `geo`, `sort=trending|aum|recent`, `limit`
- GET/POST `/api/fundgraph/signals`
  - POST body: `{ fundId, title, summary, confidence, evidenceUrl?, evidenceSnippet?, tags?, userId? }`
- POST `/api/fundgraph/signals/[id]/verify`
  - Body: `{ userId, vote: \"verify\"|\"dispute\", note? }`
  - Records signal verification/dispute and returns updated trust fields.
- GET `/api/fundgraph/conflicts`
  - Returns open cross-claim conflicts with resolution hints.
- GET `/api/fundgraph/recommendations`
  - Query: `userId`, `sector`, `stage`, `geo`, `risk`, `checkSizeM|checkSizeK`, `limit`
- GET/POST `/api/fundgraph/profile`
  - Persists LP-style profile preferences and returns top recommendations.
- GET `/api/fundgraph/funds/[id]`
  - Returns fund detail + signals + linked claims.
- GET `/api/fundgraph/graph?fundId=...`
  - Query: `fundId?`, `slug?`, `claimId?`, `depth?`, `limit?`
  - Returns canonical graph payload: `{ mode, nodes, links, focusNodeId? }`
  - Node types: `fund|company|claim|signal|source|person`
  - Relation types include: `PORTFOLIO`, `SIGNAL_FOR`, `ABOUT`, `CITES`, `MENTIONED_IN`

### Venture Intelligence Graph UI

- Shared graph renderer is used by both:
  - `/cerebrosfund/graph` (global view)
  - Fund detail Graph tab (focused by fund)
- Interactions:
  - Drag, zoom, pan network
  - Toggle node types (Funds/Companies/Claims/Signals/Sources/People)
  - Focus mode around selected fund/company with hop depth
  - Optional “Only Verified” filtering for claims/signals
  - Node details panel with claim verify/dispute action, source links, and fund navigation
  - Claim cards include **View in Graph** shortcut (`/cerebrosfund/graph?claimId=...`)

## AI tools used

- Cursor for coding, planning, and debugging (using different models depending on task complexity)
- ChatGPT for ideation, brainstorming, and as my personal UI/UX thought partner

## What I'd build with more time

- Personalization that actually learns over time  
  Right now personalization is heuristics-based. With more time, I’d make it learn from user behavior across sessions (what you read, skip, scroll, or explore).
- Stronger claim verification and source reliability  
  Trust is core to how I consume information. I’d separate high-signal vs low-signal sources and weigh them differently — currently all citations are treated equally.
- Better multi-perspective story grouping  
  News shouldn’t be consumed from a single author or lens. I’d improve clustering so each story shows multiple narratives and biases together in one place.
- Real-time social signal ingestion  
  A lot of important information appears first on social platforms. I’d add a pipeline to ingest and filter high-signal posts (e.g. Twitter) before elevating them into the feed.
- System-wide guardrails and evaluation  
  Add stronger guardrails and internal checks so summaries, verification, and clustering stay reliable as the system scales.

## Data and Scripts

- Build dataset:
  ```bash
  npm run build:dataset
  ```
- Refresh trust fields:
  ```bash
  TRUST_FIELDS_FORCE=true npx tsx scripts/enrichTrustFields.ts
  ```
- Generate synthetic CerebrosFund datasets:
  ```bash
  npm run fundgraph:generate
  ```
- Seed CerebrosFund datasets (auto-runs before `npm run dev`):
  ```bash
  npm run fundgraph:seed
  ```

## Notes

- The feed includes editorial, community, and social signals.

## Recent Updates (2026-03-06)

- Signals search now matches broader evidence fields, including source URLs, source titles, article snapshots, key facts, and quote URLs.
- Top-right header search now routes to `/cerebrosfund/signals?q=...` when you are on the Signals tab, and to `/cerebrosfund/funds?q=...` otherwise.
- Query state is synced from URL params on both Signals and Funds views, so same-route searches update correctly without stale input state.
- My Profile no longer renders the `Tier & Credit System` and `Tier Benefits Breakdown` panels.
