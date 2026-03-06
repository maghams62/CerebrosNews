# VC Curation Plan

Generated: 2026-03-06T17:27:26.238Z

## Current Models Used
- `Fund` (`web/src/lib/fundgraph/types.ts`): core profile + strategy + GP + portfolio + co-investor context.
- `Signal`: feed/memo-ready signal objects with confidence, evidence URL/snippet, tags, trust fields, plus provenance (`sourceId`, `claimIds`) and quality (`qualityTier`, `alignmentScore`, `citationMatchScore`, `articleSnapshot`).
- `NewsClaim`: citation-first claim records with linked funds and verification-compatible evidence trail fields.
- `Source`: canonical source records with `metadata` for source class, publish time, extraction time, and matched fund IDs.
- `ClaimLink` + `GraphEdge`: relationship layer for fund/claim/partner/portfolio connectivity.
- Runtime store `.fundgraph-db.json`: `sources`, `claims`, `claimLinks`, `signals`, `verifications`, `conflicts`.

## Fields Populated In This Backfill
- Fund identity: `officialUrl`, `entityType`, `aliases`, description/strategy refresh, stage/sector enrichment.
- People: expanded `gpNames` with partner facts from team/partner pages and source text.
- Relationships: expanded portfolio company lists and co-investor context from public mentions.
- News/signals/claims: enriched source-backed claims and multi-signal generation per fund with per-signal article snapshots.
- Citations: claim citations and merged evidence entries; synthetic fallback evidence marked with `isSynthetic: true` and `dataOrigin: "derived"`.

## Source Classes Used
- Canonical dataset mentions from `public/data/articles.json`.
- Official websites via wiki/wikidata domain resolution and path crawl (`/team`, `/people`, `/portfolio`, `/blog`, `/news`).
- Investing RSS config (`web/config/demo_investing_feeds.json`).
- Public social surfaces (HN Algolia + Reddit RSS).

## Jobs / Scripts Added
- `npm run fundgraph:vc-enrich` -> `web/scripts/fundgraphVcEnrich.ts`.
- `npm run fundgraph:seed-community` -> `web/scripts/fundgraphSeedCommunity.ts` (deterministic baseline sentiment/verification seeding with provenance labels).
- Helper modules under `web/scripts/fundgraphVcEnrich/`:
  - `canonicalize.ts`
  - `cleanup.ts`
  - `sources.ts`
  - `dedupe.ts`
  - `enrich.ts`

## Dedupe + Canonicalization Rules
- Fund canonicalization by normalized fund name; canonical ID = smallest numeric suffix across duplicates.
- URL normalization removes hash/UTM/trailing slash before source/news dedupe.
- News dedupe key: canonical URL OR (`normalized_title + publish_day + source + matched_fund_ids`).
- Claim dedupe: normalized claim signature + fund overlap + 7-day merge window; citations/evidence merged.
- Signal dedupe: base `dedupeSignals` + enriched key (`fundId + normalized_claim_signature + 72h_bucket + evidenceUrl/snippet`).
- Relationship dedupe: unique (`fromType`,`fromId`,`toType`,`toId`,`relation`) tuple.

## Quality Gate
- Thresholds: news>=1, citations>=1, signals>=1, partnerFacts>=0, portfolioRelationships>=1.
- Gate uses only source-backed records by default (synthetic fallback is opt-in with `--allow-synthetic-fallback`).
- Current run: passed=6, failed=34.
- Signal tiers: aligned=13, warning=190, failed=27, global_feed_eligible=203.

## Run Snapshot
- Canonical VC funds processed: 40
- New source candidates discovered: 55
- Discovery breakdown: from_articles=3, from_official=50, from_rss=6, from_hn=0, from_reddit=0
- Total merged/deduped items: 138

