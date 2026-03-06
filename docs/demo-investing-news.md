# Demo Investing News Dataset

## Repo Discovery (Step 0)

### 1) Existing RSS ingestion/fetch code
- Primary dataset pipeline: `web/scripts/buildDataset.ts`
- RSS/network helpers:
  - `web/scripts/dataset/fetch.ts` (`fetchText`, retry, limiter)
  - `web/scripts/dataset/rss.ts` (`parseRss`)
  - `web/scripts/dataset/normalize.ts` (`normalizeRssToDatasetItem`, `dedupeByCanonicalUrl`)
  - `web/scripts/dataset/extract.ts` (Readability extraction)
- Feed configuration in existing pipeline:
  - `web/scripts/dataset/sources.ts` (+ `web/scripts/dataset/feedCatalog.ts`)
  - Returned by `feedsToFetch()`
- Secondary live-feed path (non-canonical for demo dataset generation):
  - `web/src/lib/feed/getFeed.ts` + `web/src/lib/feed/sources.ts`

### 2) Canonical article schema and UI usage
- Canonical ingestion schema: `DatasetItem` in `web/scripts/dataset/schema.ts`
  - Core fields: `id`, `title`, `url`, `canonicalUrl`, `publishedAt`, `sourceId`, `sourceType`, `summary`, `tags`, `extractedText`, `media.imageUrl`
  - Extra structured fields: `audienceReaction`, `signals`, `analysis`, `entities`
- Canonical display outputs:
  - `web/public/data/articles.json` via `ArticleOutput` in `web/scripts/dataset/output.ts`
  - includes `summary`, `bulletSummary`, `biasAnalysis`, `whatsMissing`, `impact`, `audienceReaction`, `tags`
- UI readers:
  - Feed source: `web/src/app/feed/page.tsx` -> `readOfflineDataset()` from `web/src/lib/dataset/offlineDataset.ts`
  - Story groups: `web/src/lib/dataset/offlineStoryGroups.ts` + `web/src/lib/storyGroups/toStories.ts`
  - Feed rendering/filtering: `web/src/components/FeedClient.tsx`

### 3) Where articles are stored and deduped
- Canonical local store is JSON under `web/public/data/`:
  - `feed.json`, `articles.json`, `clusters.json`, `storyGroups.json`, `sources.json`, etc.
- Deduplication logic:
  - `dedupeByCanonicalUrl` in `web/scripts/dataset/normalize.ts`
  - prefers newest `publishedAt` for same canonical URL

### 4) Prompts used for normal ingestion
- Prompt execution module: `web/scripts/dataset/llm.ts`
  - `generateArticleBundle` (summary + bias + missing + impact)
  - `generateAudienceReaction`
  - cluster-level prompts: `generateClusterMissing`, `generateClusterImpact`, `generateClusterTrustMeta`
- OpenAI config:
  - requires `OPENAI_API_KEY`
  - model defaults in code (e.g. `OPENAI_SUMMARY_MODEL`, default `gpt-4o`)
- Existing build pipeline uses these post-fetch in `web/scripts/buildDataset.ts`

### 5) How tags work
- Base tags are computed by keyword topic matcher:
  - `web/scripts/dataset/tag.ts` + `web/scripts/dataset/topics.ts`
- UI uses tags heavily for filtering/ranking:
  - canonical tag mapping in `web/src/lib/tags/highSignal.ts`
  - feed inclusion gate in `FeedClient.tsx` (`isTechTags`)
- For demo integration, items include:
  - investing-specific tags (`VC`, `Funding Round`, `M&A`, etc.)
  - plus high-signal tags (`Startups`, `Finance`) so cards render in the main feed

## Demo Feed Config

- File: `web/config/demo_investing_feeds.json`
- Feed set includes 20 investing-focused sources, including:
  - TechCrunch Startups
  - TechCrunch Venture Capital
  - Crunchbase News
  - VentureBeat Business
  - Sifted
  - StrictlyVC
  - PE Hub
  - Y Combinator Blog
  - WSJ Markets
  - FT Unhedged
  - SEC Press Releases
  - MarketWatch Top Stories
  - CNBC Business / Finance
  - Forbes Business
  - Tech.eu
  - Private Equity Wire
  - City A.M. Markets
  - FT Markets
  - StartupNews.fyi

## Filtering Logic

- Implemented in `web/scripts/demoInvestingNews.ts`
- `isInvestingRelated` behavior:
  - heuristic-first keyword scoring (funding/rounds/VC/LP-GP/M&A/IPO/private markets/etc.)
  - exclusion scoring for product-launch/how-to/opinion-only content
  - uncertain cases optionally routed to LLM classifier (`classifyInvestingRelevance`)
- Marker tag added on all accepted records: `Demo:Investing`

## Run the Demo Builder

```bash
cd web
npm run demo:investing-news
```

Useful flags:

```bash
npm run demo:investing-news -- --limit=150 --since=2025-12-01 --until=2026-03-05
npm run demo:investing-news -- --dry-run
npm run demo:investing-news -- --skip-images
npm run demo:investing-news -- --disable-classifier
```

Notes:
- LLM enrichment (bundle/insights/classifier) requires `OPENAI_API_KEY`.
- If LLM calls fail repeatedly (missing/invalid key, quota, timeout), script automatically falls back to deterministic non-LLM summaries for the remaining items.
- Output is written to canonical store files in `web/public/data/`.

## Demo Mode Wiring

- Runtime switch: `CEREBROS_DEMO_MODE=investing|off` (default `off`)
- In `investing` mode:
  - feed loaders only serve articles tagged `Demo:Investing`
  - story groups are filtered to `Demo:Investing`
  - FundGraph article lookup resolves from the same canonical article store used by feed
  - FundGraph claims endpoints/pages and graph assembly filter claims/sources to demo article IDs

Example:

```bash
cd web
CEREBROS_DEMO_MODE=investing npm run dev
```

## Batch Claims + Graph Population

Use the batch command to pre-populate FundGraph claims from demo articles:

```bash
cd web
npm run fundgraph:extract-demo-claims -- --limit=50 --tag=Demo:Investing
```

Optional flags:
- `--force` to re-extract even when cached claims exist
- `--signals-per-article=0|1|2|3` to control synthetic system signal density

## Smoke Test

1. Build dataset:
   - `cd web`
   - `npm run demo:investing-news -- --limit=120`
   - Optional non-LLM run: `npm run demo:investing-news -- --limit=120 --skip-llm`
2. Start app:
   - `CEREBROS_DEMO_MODE=investing npm run dev`
3. Populate FundGraph claims:
   - `npm run fundgraph:extract-demo-claims -- --limit=50 --tag=Demo:Investing`
4. Verify:
   - Open `/feed`
   - Confirm stories are investing-focused
   - Open any card and verify summary/insight fields render
   - Confirm `Demo:Investing` is present in article tags (`web/public/data/articles.json`)
   - Open `/fundgraph/claims` and verify claims are populated
   - Open `/fundgraph/graph` and verify claims/sources/signals nodes render from persisted store
