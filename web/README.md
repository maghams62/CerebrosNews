# CerebroNews

This repository contains the CerebroNews web app (Next.js) plus dataset utilities used for building and enriching the feed.

## Components at a Glance

- ENV (keys and connectors): `.env.local`
  - OpenAI key for the ask flow: `OPENAI_API_KEY`.
  - Optional Bluesky connector credentials: `BLUESKY_EMAIL`, `BLUESKY_PASSWORD`, `BLUESKY_HANDLE`, `BLUESKY_SERVICE`.
- Data scripts (build/enrich): `scripts/`
  - Dataset builder, tagging, trust fields backfill, and story group curation.

These two areas are the primary drivers; the rest of the app consumes them.

## Index
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API](#api)
- [Data and Scripts](#data-and-scripts)
- [Notes](#notes)

## Prerequisites

- Node.js 18+ (or 20+)
- npm

## Setup

- Environment variables are already provided via `.env.local.example`.
  - Copy it to `.env.local` and add your OpenAI key.
  - Optional: add Bluesky credentials if you want social signal items.

```bash
cp .env.local.example .env.local
```

## Quick Start

Run everything from the `web/` directory:

```bash
npm install
npm run build
npm run dev:onboarding
```

Open http://localhost:3000 in your browser.

## Environment Variables

Example `.env.local`:

```env
OPENAI_API_KEY=your_key_here
BLUESKY_EMAIL=...
BLUESKY_PASSWORD=...
BLUESKY_HANDLE=...
BLUESKY_SERVICE=https://bsky.social
```

 - `OPENAI_API_KEY`: Enables the ask flow in the feed UI.
 - `BLUESKY_*`: Optional. Used to pull social signal items into the feed.

## API

- POST `/api/ask`
  - Body: `{ "question": "...", "context": "...", "summary": "..." }`
  - Returns: `{ "answer": "...", "sources": [...] }`

## Data and Scripts

- Build dataset:
  ```bash
  npm run build:dataset
  ```
- Refresh trust fields:
  ```bash
  TRUST_FIELDS_FORCE=true npx tsx scripts/enrichTrustFields.ts
  ```

## Notes

- The feed includes editorial, community, and social signals.
- Bluesky is treated as a social signal layer, not a primary news source.
