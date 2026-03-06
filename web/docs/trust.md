# FundGraph Trust Layer (v1)

This document describes the trust primitives implemented for FundGraph in Cerebros News.

## Trust Score v1

FundGraph computes trust for both **claims** and **signals** at API read time.

Returned fields:
- `trustScore` (0-100)
- `trustTier` (`LOW | MEDIUM | HIGH`)
- `trustExplanation` (short rationale)

### Formula

1. LLM signal:
- `supported` => `+40`
- `mixed` => `+20`
- `unsupported` => `+0`
- plus `verificationConfidence * 30`

2. Citation strength:
- `min(15, snippet_length / 20)`
- plus a small citation-count bump for multi-citation payloads

3. Community verification:
- `+ 5 * verifiedCount - 5 * disputedCount`
- capped to `[-20, +20]`

4. Author reputation:
- `+ min(10, authorCredScore / 2)`

Final score is clamped to `0..100`.

Tier mapping:
- `LOW`: `< 40`
- `MEDIUM`: `40..69.99`
- `HIGH`: `>= 70`

## Author Reputation (Cred)

User fields:
- `user.credScore`
- `user.badgeTier`

Badge tiers:
- `0-4`: `NEW`
- `5-14`: `CONTRIBUTOR`
- `15-29`: `VERIFIER`
- `30+`: `HIGH_SIGNAL`

Seed users in the local store:
- `siddharth` (`Siddharth`)
- `anon` (`Anonymous`)

Cred events:
- Create signal: `+1`
- Verify claim/signal: `+1` (first vote per user/target)
- Dispute claim/signal: `+1` (first vote per user/target)
- Signal reaches >=3 verifications from other users: signal author `+2` (one-time)
- Claim/signal reaches >=3 disputes from other users: content author `-2` (one-time)

## Community Verification APIs

### New trust-layer endpoints

- `POST /api/fundgraph/claims/:id/verify`
  - Body: `{ userId, vote: "verify" | "dispute", note?, userName? }`

- `POST /api/fundgraph/signals/:id/verify`
  - Body: `{ userId, vote: "verify" | "dispute", note?, userName? }`

Both endpoints return updated:
- verification counters
- `trustScore`, `trustTier`, `trustExplanation`
- contributor cred/badge

### Backward compatibility

- `POST /api/fundgraph/verify_claim` remains available.
- Legacy `disagree` votes are normalized to `dispute`.

## Conflicting Claims

Conflict records are persisted in local store with:
- `id`
- `claimIdA`
- `claimIdB`
- `status: open | resolved`
- `resolutionNote?`
- `resolutionHint?`
- timestamps

### MVP detection heuristic

Two claims conflict if they share normalized:
- `entity`
- `attribute`

and have either:
- different extracted values (for example, different round amounts), or
- opposite polarity (positive vs negative assertion).

Normalization shape:
- `{ entity, attribute, value, polarity }`

### Resolution hints

For new conflicts, FundGraph stores a short `resolutionHint`:
- LLM-assisted in `hybrid/real` when available
- deterministic fallback in `mock` or on LLM failure

## Conflict APIs

- `GET /api/fundgraph/conflicts`
  - Returns open conflicts (with lightweight claim previews)

- `GET /api/fundgraph/claims/:id/conflicts`
  - Returns open conflicts for one claim

## Notes

- Trust fields are computed at read time for iteration speed.
- Local persistence uses `.fundgraph-db.json` in `web/`.
