# Graph Analyzer: Actionable-Only Spec + Backfill Plan

## 1) What should be in the analyzer side panel

Keep the panel limited to decisions, not raw dump.

1. Query Explain (compact)
- Intent + resolved entities only.
- Example: `Companies Linked` • `Anthropic`.

2. Data Readiness (single status card)
- Cited coverage %, cited/eligible counts, threshold.
- One status line only:
  - `Ready for full analytics` when coverage >= 70%.
  - `Verified subset only` when coverage < 70%.

3. Top Actionable Metrics (max 3 cards)
- Preset-specific and citation-backed only.
- Example for Co-Investment:
  - `Verified Investment Links`
  - `Verified Co-Invest Links`
  - `Average Verified Check Size`

4. Selected Item Detail (node or edge)
- Show only evidence-backed values.
- Hide uncited numeric fields.
- Include citation count and top 1-2 evidence snippets.

5. Optional "Show more"
- Collapse long neighbor/evidence lists by default.
- Expand only on user click.

## 2) Metadata required for filters to work

For each extracted source/signal, persist enough tags to power filters:

- Fund-level:
  - `sectors[]` (controlled values)
  - `stages[]` (controlled values)
  - `geography[]`
  - `strategy`
  - `gpNames[]`

- Deal-level (`DealFact`):
  - `fundId`
  - `companyName` (+ canonical id hint if known)
  - `roundStage`
  - `announcedAt`
  - `amountMinM`, `amountMaxM`
  - `checkType` (`lead|follow|unknown`)
  - `sourceRefs[]`, `citationCount`, `verified`, `confidence`

- Signal-level:
  - `eventType`
  - `tags[]` (high-signal only)
  - linked entities (fund/company/person)
  - evidence URL/snippet

## 3) Backfill strategy

1. Run citation-first extraction per source using:
- `packages/llm/prompts/fundgraph/extract_graph_facts.prompt`

2. Normalize to canonical entities:
- match fund/company/person names to canonical dictionaries
- keep `rawMention` for uncertain matches

3. Persist only verified metrics for analytics:
- uncited facts can be stored for triage, but not rendered as metrics

4. Track readiness per preset:
- cited coverage = `citedMetricCount / eligibleMetricCount`
- unlock full analytics only at `>= 70%`

## 4) Acceptance checks

1. Sector/stage filters visibly reduce graph scope.
2. No uncited numeric metric appears in panel/cards.
3. Query results stay focused (no irrelevant evidence spillover).
4. Coverage gate behavior is consistent for `<70%` and `>=70%`.
