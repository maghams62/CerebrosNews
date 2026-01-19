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
npm run onboarding
```

Open http://localhost:3000 in your browser.

## Environment Variables

Example `.env`:

```env
OPENAI_API_KEY=sk-your-openai-api-key
```

- `OPENAI_API_KEY`: Enables the ask flow in the feed UI.

## API

- POST `/api/ask`
  - Body: `{ "question": "...", "context": "...", "summary": "..." }`
  - Returns: `{ "answer": "...", "sources": [...] }`

## AI tools used

- Cursor for coding, planning, and debugging (using different models depending on task complexity)
- ChatGPT for ideation, brainstorming, and as my personal UI/UX thought partner

## What I'd build with more time

- Personalization that actually learns over time (behavior-aware, cross-session learning)
- Stronger claim verification and source reliability weighting
- Better multi-perspective story grouping (multiple narratives per story)
- Real-time social signal ingestion and filtering (e.g., Twitter)
- System-wide guardrails and evaluation for reliability at scale

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
